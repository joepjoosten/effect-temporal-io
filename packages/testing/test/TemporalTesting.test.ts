import { describe, expect, it } from "@effect/vitest"
import * as TemporalTesting from "../src/index.js"

describe("TemporalTesting", () => {
  it("creates unique task queue names with the requested prefix", () => {
    const first = TemporalTesting.makeTaskQueue("checkout")
    const second = TemporalTesting.makeTaskQueue("checkout")

    expect(first).toMatch(/^checkout-/)
    expect(second).toMatch(/^checkout-/)
    expect(first).not.toEqual(second)
  })
})
