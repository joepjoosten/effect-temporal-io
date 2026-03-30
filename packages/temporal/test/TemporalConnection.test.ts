import { describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as TemporalConnection from "../src/TemporalConnection.js"

describe("TemporalConnection", () => {
  it("maps connection failures into TemporalConnectionError", async () => {
    const exit = await Effect.runPromiseExit(
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
  })
})
