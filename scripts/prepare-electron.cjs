// Copies the assets the Next.js standalone server doesn't trace automatically (see Dockerfile).
// The traced dependency directory is renamed because electron-builder filters directories named
// node_modules from extraResources, even when they are part of a standalone server bundle.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const nodeModules = path.join(standalone, "node_modules");
const packagedNodeModules = path.join(standalone, "server_node_modules");

if (!fs.existsSync(standalone)) {
  console.error(
    `Standalone build not found at ${standalone}. Run "next build" first.`,
  );
  process.exit(1);
}

fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  {
    recursive: true,
  },
);
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});

if (!fs.existsSync(nodeModules)) {
  console.error(`Traced dependencies not found at ${nodeModules}.`);
  process.exit(1);
}

fs.rmSync(packagedNodeModules, { recursive: true, force: true });
fs.renameSync(nodeModules, packagedNodeModules);
