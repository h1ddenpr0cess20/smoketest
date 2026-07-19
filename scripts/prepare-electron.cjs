// Copies the assets the Next.js standalone server doesn't trace automatically (see Dockerfile).
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

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
