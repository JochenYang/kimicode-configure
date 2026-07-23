import { build } from "esbuild"

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "plugin/bin/server.mjs",
  sourcemap: false,
  legalComments: "none",
})
