import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Ledger tests share one database, so they must not run in parallel.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Server modules guard themselves with `import "server-only"`, which
      // resolves to a module that throws unless the importer is a React server
      // component. Vitest is neither, so without this every test that touches
      // the wallet, tasks or tier services would fail at import time.
      //
      // Aliased rather than set through `resolve.conditions`: vitest
      // externalises node_modules for SSR, so the condition never reaches this
      // package's export map. `empty.js` is the no-op the package itself ships
      // for exactly this purpose.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
});
