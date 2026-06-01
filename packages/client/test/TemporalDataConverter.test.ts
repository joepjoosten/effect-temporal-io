import { METADATA_ENCODING_KEY, type Payload } from "@temporalio/common"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import { describe, expect, it } from "vitest"
import * as TemporalDataConverter from "../src/TemporalDataConverter.js"

const fixedKey = new Uint8Array(32).fill(7)
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const encodeString = (value: string): Uint8Array => textEncoder.encode(value)

const decodeString = (value: Uint8Array): string => textDecoder.decode(value)

const makePayload = (): Payload => ({
  metadata: {
    [METADATA_ENCODING_KEY]: encodeString("json/plain")
  },
  data: encodeString(JSON.stringify({ hello: "world" }))
})

describe("TemporalDataConverter", () => {
  it("encrypts and decrypts Temporal payloads using an Effect-backed key provider", async () => {
    let generated = 0
    let decrypted = 0
    const provider: TemporalDataConverter.TemporalCodecKeyProvider = {
      generateDataKey: Effect.sync(() => {
        generated += 1
        return {
          key: Redacted.make(fixedKey),
          metadata: {
            [TemporalDataConverter.METADATA_ENCRYPTED_DATA_KEY]: encodeString("encrypted-test-key")
          }
        }
      }),
      decryptDataKey: (metadata) =>
        Effect.sync(() => {
          decrypted += 1
          expect(decodeString(metadata[TemporalDataConverter.METADATA_ENCRYPTED_DATA_KEY])).toBe("encrypted-test-key")
          return Redacted.make(fixedKey)
        })
    }
    const codec = TemporalDataConverter.makePayloadCodec(provider)
    const payload = makePayload()

    const [encoded] = await codec.encode([payload])

    expect(generated).toBe(1)
    expect(decodeString(encoded.metadata?.[METADATA_ENCODING_KEY] as Uint8Array)).toBe(
      TemporalDataConverter.ENCRYPTED_ENCODING
    )
    expect(Buffer.from(encoded.data as Uint8Array)).not.toEqual(Buffer.from(payload.data as Uint8Array))

    const [decoded] = await codec.decode([encoded])

    expect(decrypted).toBe(1)
    expect(decoded.metadata).toEqual(payload.metadata)
    expect(Buffer.from(decoded.data as Uint8Array)).toEqual(Buffer.from(payload.data as Uint8Array))
  })

  it("leaves payloads without encrypted metadata untouched", async () => {
    const provider: TemporalDataConverter.TemporalCodecKeyProvider = {
      generateDataKey: Effect.fail(TemporalDataConverter.fail("unused")),
      decryptDataKey: () => Effect.fail(TemporalDataConverter.fail("unused"))
    }
    const codec = TemporalDataConverter.makePayloadCodec(provider)
    const payload = makePayload()

    await expect(codec.decode([payload])).resolves.toEqual([payload])
  })

  it("creates a data converter layer with the codec attached", async () => {
    const provider: TemporalDataConverter.TemporalCodecKeyProvider = {
      generateDataKey: Effect.succeed({ key: fixedKey }),
      decryptDataKey: () => Effect.succeed(fixedKey)
    }
    const dataConverter = await Effect.runPromise(
      Effect.gen(function*() {
        return yield* TemporalDataConverter.TemporalDataConverter
      }).pipe(
        Effect.provide(TemporalDataConverter.layerWithCodec()),
        Effect.provide(TemporalDataConverter.keyProviderLayer(provider))
      )
    )

    expect(dataConverter.payloadCodecs).toHaveLength(1)
  })
})
