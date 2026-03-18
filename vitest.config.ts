import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    // Each test file gets a fresh module registry so env stubs don't bleed across tests
    isolate: true,
  },
});
