import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as TemporalError from "../src/TemporalError.js"

describe("TemporalError", () => {
  it.effect("maps rejected promises into TemporalClientError", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        TemporalError.tryClientPromise("test.operation", () => Promise.reject(new Error("boom")))
      )

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("TemporalClientError")
        expect(String(exit.cause)).toContain("test.operation")
      }
    }))
})
