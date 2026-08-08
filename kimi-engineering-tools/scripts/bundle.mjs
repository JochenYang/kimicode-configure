import { build } from "esbuild"
import fs from "node:fs/promises"

const pkg = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"))

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "plugin/bin/server.mjs",
  sourcemap: false,
  legalComments: "none",
  define: {
    __PLUGIN_VERSION__: JSON.stringify(pkg.version),
  },
})
