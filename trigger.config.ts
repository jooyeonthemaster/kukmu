// @ts-nocheck
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_ecnqsruriwmlobcdudmy",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
    },
  },
  dirs: ["./trigger"],
});
