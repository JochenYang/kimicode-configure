import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"

const pluginRoot = path.resolve("plugin")
const manifestPath = path.join(pluginRoot, "kimi.plugin.json")
const bundlePath = path.join(pluginRoot, "bin", "server.mjs")
const allowedFiles = new Set([
  "README.md",
  "bin/server.mjs",
  "kimi.plugin.json",
])

async function listFiles(directory, root = directory) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(absolute, root))
    else if (entry.isFile()) files.push(path.relative(root, absolute).replace(/\\/g, "/"))
  }
  return files
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
assert.equal(manifest.name, "kimi-engineering-tools")
assert.equal(manifest.version, "0.2.0")
assert.deepEqual(manifest.mcpServers?.["engineering-tools"], {
  command: "node",
  args: ["./bin/server.mjs"],
  cwd: "./",
  startupTimeoutMs: 30000,
  toolTimeoutMs: 120000,
})

const files = await listFiles(pluginRoot)
assert.deepEqual(files.sort(), [...allowedFiles].sort(), `Unexpected plugin files: ${files.join(", ")}`)
const bundle = await fs.readFile(bundlePath, "utf8")
assert.ok(bundle.length > 10_000, "Bundled MCP server is unexpectedly small")
assert.doesNotMatch(bundle, /^\s*import .* from ["'](?:@modelcontextprotocol|zod|minimatch)/m)
execFileSync(process.execPath, ["--check", bundlePath], { stdio: "inherit" })

console.log(`Plugin package verified: ${files.length} files, ${(bundle.length / 1024).toFixed(1)} KiB bundle`)
