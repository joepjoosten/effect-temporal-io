/**
 * Effect Schema helpers for validating Temporal client boundaries.
 *
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { makeValidationError, type TemporalValidationDirection, type TemporalValidationError } from "./TemporalError.js"

/**
 * @since 1.0.0
 * @category Models
 */
export type Any = Schema.Top

/**
 * Schema shape expected for Temporal argument lists.
 *
 * Use `Schema.Tuple([...])` for workflow and activity args.
 *
 * @since 1.0.0
 * @category Models
 */
export type Args = Schema.Top & {
  readonly Type: ReadonlyArray<any>
  readonly Encoded: ReadonlyArray<any>
}

/**
 * @since 1.0.0
 * @category Models
 */
export type Type<S extends Schema.Top> = S["Type"]

/**
 * @since 1.0.0
 * @category Models
 */
export type Encoded<S extends Schema.Top> = S["Encoded"]

/**
 * @since 1.0.0
 * @category Models
 */
export type DecodingServices<S extends Schema.Top> = S["DecodingServices"]

/**
 * @since 1.0.0
 * @category Models
 */
export interface ArgsSchema<A extends Args> {
  readonly args: A
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface ResultSchema<A extends Schema.Top> {
  readonly result: A
}

/**
 * @since 1.0.0
 * @category Models
 */
export interface ArgsAndResultSchema<A extends Args, B extends Schema.Top> extends ArgsSchema<A>, ResultSchema<B> {}

/**
 * @since 1.0.0
 * @category Constructors
 */
export const decode = <S extends Schema.Top>(
  operation: string,
  direction: TemporalValidationDirection,
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], TemporalValidationError, S["DecodingServices"]> =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) => makeValidationError(operation, direction, cause))
  )

/**
 * @since 1.0.0
 * @category Constructors
 */
export const decodeInput = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], TemporalValidationError, S["DecodingServices"]> => decode(operation, "input", schema, value)

/**
 * @since 1.0.0
 * @category Constructors
 */
export const decodeOutput = <S extends Schema.Top>(
  operation: string,
  schema: S,
  value: unknown
): Effect.Effect<S["Type"], TemporalValidationError, S["DecodingServices"]> =>
  decode(operation, "output", schema, value)
