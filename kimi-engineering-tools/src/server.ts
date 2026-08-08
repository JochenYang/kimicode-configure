import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { runCodeSearch } from "./tools/codesearch.js"
import { runDeadCode } from "./tools/dead-code.js"
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

server.tool(
  "codesearch",
  `AST-based structural code search using ast-grep.

Use when searching for code shape rather than text, such as classes, async
functions, method calls, hooks, or try/catch blocks. Requires ast-grep on PATH
or in the current project's node_modules/.bin directory.`,
  {
    pattern: z.string().describe("AST pattern, e.g. 'class $NAME' or 'console.log($$$)'."),
    lang: z.string().describe("Language name or alias, e.g. typescript, tsx, js, python, rust, go."),
    path: z
      .string()
      .optional()
      .describe(
        "Directory to search. Prefer an absolute path when this server runs as a plugin (process cwd is the plugin install dir). Relative paths resolve against cwd. Defaults to cwd.",
      ),
    maxResults: z.number().int().positive().max(250).optional().describe("Maximum matches to display. Defaults to 30."),
    cwd: z
      .string()
      .optional()
      .describe(
        "Project root / working directory. Prefer an absolute workspace path. Defaults to MCP process cwd (plugin install dir when installed as a plugin).",
      ),
  },
  async (input) => ({
    content: [{ type: "text", text: await runCodeSearch(input) }],
  }),
)

server.tool(
  "dead_code",
  `Detect candidate modules that are unreachable from configured entry points.

This is a heuristic static analysis tool. Treat results as review candidates,
not proof that code can be deleted. Dynamic imports, framework routes, plugin
entrypoints, and CLI entrypoints can be false positives.`,
  {
    entry: z
      .string()
      .optional()
      .describe(
        "Source directory to analyze. Prefer an absolute path under plugin MCP. Relative paths resolve against cwd. Defaults to cwd.",
      ),
    entry_points: z.array(z.string()).optional().describe("Module keys that count as live entry points. Relative to the analyzed directory, extension optional (e.g. 'src/main', 'packages/a/src/index.ts'); absolute paths are mapped inside automatically. Merged with built-in defaults."),
    min_exports: z.number().int().positive().optional().describe("Minimum exported symbols in a dead module to report. Defaults to 1."),
    min_confidence: z.enum(["high", "medium", "low"]).optional().describe("Minimum confidence to report. high = zero in-tree references, medium = referenced only by unreachable modules, low = zero-inbound heuristic. Defaults to low."),
    lang: z.array(z.string()).optional().describe("Explicit languages/extensions, e.g. ['typescript'] or ['ts', 'tsx']."),
    exclude: z.array(z.string()).optional().describe("Additional glob patterns to exclude, e.g. ['packages/plugin/**', '**/*.generated.ts']."),
    include_default_excludes: z.boolean().optional().describe("Default true. Set false to include tests, mocks, storybook, generated files, and examples."),
    cwd: z
      .string()
      .optional()
      .describe(
        "Project root / working directory. Prefer an absolute workspace path. Defaults to MCP process cwd (plugin install dir when installed as a plugin).",
      ),
  },
  async (input) => ({
    content: [{ type: "text", text: await runDeadCode(input) }],
  }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
