/**
 * Effect services and helpers for Temporal data converters and payload codecs.
 *
 * @since 1.0.0
 */
import {
  type DataConverter,
  METADATA_ENCODING_KEY,
  type Payload,
  type PayloadCodec,
  ValueError
} from "@temporalio/common"
import { temporal } from "@temporalio/proto"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import type { webcrypto as crypto } from "node:crypto"
import { webcrypto } from "node:crypto"

const CIPHER = "AES-GCM"
const IV_LENGTH_BYTES = 12
const TAG_LENGTH_BYTES = 16
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Metadata encoding value used by the encrypted payload codec.
 *
 * @since 1.0.0
 * @category Constants
 */
export const ENCRYPTED_ENCODING = "binary/encrypted"

/**
 * Metadata key containing the encrypted encoding marker.
 *
 * @since 1.0.0
 * @category Constants
 */
export const METADATA_ENCRYPTED_ENCODING_KEY = "enc-encoding"

/**
 * Optional conventional metadata key for encrypted data keys.
 *
 * Implementations are free to use different metadata, but this matches the
 * Temporal SDK encryption examples and is useful for KMS-backed providers.
 *
 * @since 1.0.0
 * @category Constants
 */
export const METADATA_ENCRYPTED_DATA_KEY = "enc-data-key"

/**
 * @since 1.0.0
 * @category Errors
 */
export class TemporalCodecError extends Data.TaggedError("TemporalCodecError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  constructor(props: { readonly message: string; readonly cause?: unknown }) {
    super(props)
  }
}

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalCodecKey = Uint8Array | Redacted.Redacted<Uint8Array>

/**
 * @since 1.0.0
 * @category Models
 */
export interface TemporalGeneratedDataKey {
  readonly key: TemporalCodecKey
  readonly metadata?: Record<string, Uint8Array> | undefined
}

/**
 * Effect-backed provider for payload encryption keys.
 *
 * The provider owns all key retrieval details. For example, an AWS KMS layer can
 * generate a plaintext data key plus encrypted-key metadata and later decrypt
 * that key from the payload metadata, while this package remains AWS-free.
 *
 * @since 1.0.0
 * @category Models
 */
export interface TemporalCodecKeyProvider {
  readonly generateDataKey: Effect.Effect<TemporalGeneratedDataKey, TemporalCodecError>
  readonly decryptDataKey: (metadata: Readonly<Record<string, Uint8Array>>) => Effect.Effect<
    TemporalCodecKey,
    TemporalCodecError
  >
}

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalCodecKeyProvider = Context.Service<TemporalCodecKeyProvider>(
  "@effect-temporal/client/TemporalCodecKeyProvider"
)

/**
 * @since 1.0.0
 * @category Models
 */
export type TemporalDataConverter = DataConverter

/**
 * @since 1.0.0
 * @category Tags
 */
export const TemporalDataConverter = Context.Service<TemporalDataConverter>(
  "@effect-temporal/client/TemporalDataConverter"
)

const encodeString = (value: string): Uint8Array => textEncoder.encode(value)

const decodeString = (bytes: Uint8Array): string => textDecoder.decode(bytes)

const revealKey = (key: TemporalCodecKey): Uint8Array =>
  Redacted.isRedacted(key) ? Redacted.value(key as Redacted.Redacted<Uint8Array>) : key

const codecError = (message: string, cause?: unknown): TemporalCodecError =>
  new TemporalCodecError(cause === undefined ? { message } : { message, cause })

const runKeyEffect = <A>(effect: Effect.Effect<A, TemporalCodecError>): Promise<A> => Effect.runPromise(effect)

const createCryptoKey = (key: TemporalCodecKey): Promise<crypto.CryptoKey> =>
  webcrypto.subtle.importKey("raw", Buffer.from(revealKey(key)), { name: CIPHER }, false, ["encrypt", "decrypt"])

const encrypt = async (data: Uint8Array, key: crypto.CryptoKey): Promise<Uint8Array> => {
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const encrypted = await webcrypto.subtle.encrypt(
    {
      name: CIPHER,
      iv,
      tagLength: TAG_LENGTH_BYTES * 8
    },
    key,
    data
  )

  return Buffer.concat([iv, new Uint8Array(encrypted)])
}

const decrypt = async (encryptedData: Uint8Array, key: crypto.CryptoKey): Promise<Uint8Array> => {
  if (encryptedData.byteLength <= IV_LENGTH_BYTES) {
    throw new ValueError("Encrypted payload data is missing ciphertext")
  }

  const iv = encryptedData.subarray(0, IV_LENGTH_BYTES)
  const ciphertext = encryptedData.subarray(IV_LENGTH_BYTES)
  const decrypted = await webcrypto.subtle.decrypt(
    {
      name: CIPHER,
      iv,
      tagLength: TAG_LENGTH_BYTES * 8
    },
    key,
    ciphertext
  )

  return new Uint8Array(decrypted)
}

const isEncryptedPayload = (payload: Payload): boolean => {
  const encodedEncoding = payload.metadata?.[METADATA_ENCODING_KEY]
  return encodedEncoding != null && decodeString(encodedEncoding) === ENCRYPTED_ENCODING
}

const decodeEncryptedPayload = async (
  payload: Payload,
  provider: TemporalCodecKeyProvider
): Promise<Payload> => {
  const metadata = payload.metadata
  const encodedEncoding = metadata?.[METADATA_ENCODING_KEY]

  if (metadata == null || encodedEncoding == null || !isEncryptedPayload(payload)) {
    return payload
  }

  if (payload.data == null) {
    throw new ValueError("Payload data is missing")
  }

  const encryptedEncoding = metadata[METADATA_ENCRYPTED_ENCODING_KEY]

  if (encryptedEncoding == null) {
    throw new ValueError("Unable to decrypt Payload without encrypted encoding metadata")
  }

  const cryptoKey = await createCryptoKey(await runKeyEffect(provider.decryptDataKey(metadata)))
  const decryptedEncoding = await decrypt(encryptedEncoding, cryptoKey)

  if (decodeString(encodedEncoding) !== decodeString(decryptedEncoding)) {
    throw new ValueError("Encrypted encoding does not match. The payload cannot be decrypted correctly.")
  }

  const decryptedPayloadBytes = await decrypt(payload.data, cryptoKey)
  return temporal.api.common.v1.Payload.decode(decryptedPayloadBytes)
}

/**
 * Creates a Temporal payload codec that encrypts payload bytes using AES-GCM.
 *
 * Key generation and key retrieval are delegated to the supplied
 * `TemporalCodecKeyProvider`, so AWS KMS, local keys, or any other key source
 * can be implemented as an Effect layer outside of this package.
 *
 * @since 1.0.0
 * @category Constructors
 */
export const makePayloadCodec = (provider: TemporalCodecKeyProvider): PayloadCodec => ({
  encode: async (payloads) => {
    const encodedEncoding = encodeString(ENCRYPTED_ENCODING)
    const generated = await runKeyEffect(provider.generateDataKey)
    const cryptoKey = await createCryptoKey(generated.key)
    const encryptedEncoding = await encrypt(encodedEncoding, cryptoKey)
    const metadata = {
      ...(generated.metadata ?? {}),
      [METADATA_ENCODING_KEY]: encodedEncoding,
      [METADATA_ENCRYPTED_ENCODING_KEY]: encryptedEncoding
    }

    return Promise.all(
      payloads.map(async (payload) => ({
        metadata,
        data: await encrypt(temporal.api.common.v1.Payload.encode(payload).finish(), cryptoKey)
      }))
    )
  },
  decode: (payloads) => Promise.all(payloads.map((payload) => decodeEncryptedPayload(payload, provider)))
})

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makePayloadCodecFromKeyProvider: Effect.Effect<PayloadCodec, never, TemporalCodecKeyProvider> = Effect.gen(
  function*() {
    const provider = yield* TemporalCodecKeyProvider
    return makePayloadCodec(provider)
  }
)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const make = (dataConverter: DataConverter = {}): TemporalDataConverter => dataConverter

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithPayloadCodec = (
  provider: TemporalCodecKeyProvider,
  dataConverter?: DataConverter
): TemporalDataConverter =>
  make({
    ...dataConverter,
    payloadCodecs: [...(dataConverter?.payloadCodecs ?? []), makePayloadCodec(provider)]
  })

/**
 * @since 1.0.0
 * @category Constructors
 */
export const makeWithCodec = (
  dataConverter?: DataConverter
): Effect.Effect<TemporalDataConverter, never, TemporalCodecKeyProvider> =>
  Effect.gen(function*() {
    const provider = yield* TemporalCodecKeyProvider
    return makeWithPayloadCodec(provider, dataConverter)
  })

/**
 * @since 1.0.0
 * @category Layers
 */
export const keyProviderLayer = (
  provider: TemporalCodecKeyProvider
): Layer.Layer<TemporalCodecKeyProvider> => Layer.succeed(TemporalCodecKeyProvider, provider)

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer = (dataConverter?: DataConverter): Layer.Layer<TemporalDataConverter> =>
  Layer.succeed(TemporalDataConverter, make(dataConverter))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithPayloadCodec = (
  provider: TemporalCodecKeyProvider,
  dataConverter?: DataConverter
): Layer.Layer<TemporalDataConverter> =>
  Layer.succeed(TemporalDataConverter, makeWithPayloadCodec(provider, dataConverter))

/**
 * @since 1.0.0
 * @category Layers
 */
export const layerWithCodec = (
  dataConverter?: DataConverter
): Layer.Layer<TemporalDataConverter, never, TemporalCodecKeyProvider> =>
  Layer.effect(TemporalDataConverter)(makeWithCodec(dataConverter))

/**
 * @since 1.0.0
 * @category Constructors
 */
export const fail = (message: string, cause?: unknown): TemporalCodecError => codecError(message, cause)
