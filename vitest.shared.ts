import * as path from "node:path"
import type { UserConfig } from "vitest/config"

const alias = (name: string) => {
  const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"
  return ({
    [`${name}/test`]: path.join(__dirname, "packages", name, "test"),
    [`${name}`]: path.join(__dirname, "packages", name, target)
  })
}

const scopedAlias = (scope: string, name: string) => {
  const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"
  return ({
    [`@effect-temporal/${scope}`]: path.join(__dirname, "packages", name, target),
    [`@effect-temporal/${scope}/TemporalClient`]: path.join(__dirname, "packages", name, target, "TemporalClient"),
    [`@effect-temporal/${scope}/TemporalConnection`]: path.join(__dirname, "packages", name, target, "TemporalConnection"),
    [`@effect-temporal/${scope}/TemporalError`]: path.join(__dirname, "packages", name, target, "TemporalError"),
    [`@effect-temporal/${scope}/TemporalWorker`]: path.join(__dirname, "packages", name, target, "TemporalWorker"),
    [`@effect-temporal/${scope}/TemporalWorkflowEngine`]: path.join(
      __dirname,
      "packages",
      name,
      target,
      "TemporalWorkflowEngine"
    )
  })
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: UserConfig = {
  esbuild: {
    target: "es2020"
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"]
  },
  test: {
    setupFiles: [path.join(__dirname, "setupTests.ts")],
    fakeTimers: {
      toFake: undefined
    },
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.ts"],
    alias: {
      ...alias("temporal"),
      ...alias("testing"),
      ...scopedAlias("workflow", "temporal"),
      ...scopedAlias("testing", "testing")
    }
  }
}

export default config
