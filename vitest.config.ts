import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ["convex/**", "edge-runtime"],
      ["**", "node"],
    ],
    server: { deps: { inline: ["convex-test"] } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
