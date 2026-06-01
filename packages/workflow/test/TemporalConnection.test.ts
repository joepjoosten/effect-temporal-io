import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as TemporalConnection from "../src/TemporalConnection.js"

describe("TemporalConnection", () => {
  it.effect("maps connection failures into TemporalConnectionError", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        Effect.scoped(
          TemporalConnection.make({
            address: ":invalid"
          })
        )
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("TemporalConnectionError")
      }
    }))
})
