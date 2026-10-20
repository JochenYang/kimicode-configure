import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { runGitConventions } from "./tools/git-conventions.js"

// Injected by scripts/bundle.mjs from package.json so the reported server
// version never drifts from the published plugin version.
declare const __PLUGIN_VERSION__: string

const server = new McpServer({
  name: "kimi-engineering-tools",
  version: __PLUGIN_VERSION__,
})

server.tool(
  "git_conventions",
  `Validate git commit messages and branch naming conventions.

Use before proposing commits, branch names, or PR metadata. Returns validation
results plus the user's Git convention guide unless include_guide=false.`,
  {
    message: z.string().optional().describe("Proposed commit message, including optional body."),
    branch: z.string().optional().describe("Current or proposed branch name."),
    files: z.array(z.string()).optional().describe("Changed file paths for the output contract."),
    include_guide: z.boolean().optional().describe("Default true. Set false for validation result only."),
    enforce_body: z.boolean().optional().describe("Default true. When true (default), missing body is WARN and bad body is ERROR. Pass false only to validate subject-only."),
  },
  async (input) => ({
    content: [{ type: "text", text: runGitConventions(input) }],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
