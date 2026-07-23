import assert from "node:assert/strict"
import test from "node:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

test("bundled server starts and exposes the expected tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["./plugin/bin/server.mjs"],
    cwd: process.cwd(),
  })
  const client = new Client({ name: "plugin-smoke-test", version: "1.0.0" })
  try {
    await client.connect(transport)
    const response = await client.listTools()
    assert.deepEqual(
      response.tools.map((tool) => tool.name).sort(),
      ["codesearch", "dead_code", "git_conventions"],
    )
  } finally {
    await client.close()
  }
})
