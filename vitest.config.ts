import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "lib/chatLinks.ts",
        "lib/commands.ts",
        "lib/compaction.ts",
        "lib/docPaths.ts",
        "lib/downloads.ts",
        "lib/export.ts",
        "lib/memory.ts",
        "lib/messageQueue.ts",
        "lib/providers.ts",
        "lib/rag.ts",
        "lib/roundtable/index.ts",
        "lib/skills.ts",
        "lib/stream.ts",
        "lib/tokenBudget.ts",
        "lib/tools.ts",
      ],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
