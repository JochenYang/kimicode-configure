import { execFile, execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)

const LANG_ALIASES: Record<string, string> = {
  typescript: "typescript",
  ts: "typescript",
  tsx: "tsx",
  javascript: "javascript",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  python: "python",
  rust: "rust",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  csharp: "csharp",
  cs: "csharp",
  css: "css",
  html: "html",
  bash: "bash",
  sh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  ruby: "ruby",
  rb: "ruby",
  php: "php",
  lua: "lua",
  elixir: "elixir",
  haskell: "haskell",
  hs: "haskell",
}

interface AstGrepMatch {
  file: string
  range?: { start?: { line?: number; column?: number } }
  text?: string
}

export interface CodeSearchInput {
  pattern: string
  lang: string
  path?: string
  maxResults?: number
  cwd?: string
}

let cachedBin: string | null | undefined

function findAstGrep(projectDir: string): string | null {
  if (cachedBin !== undefined) return cachedBin
  const localBin = path.join(projectDir, "node_modules", ".bin", process.platform === "win32" ? "ast-grep.cmd" : "ast-grep")
  if (fs.existsSync(localBin)) {
    cachedBin = localBin
    return localBin
  }
  const which = process.platform === "win32" ? "where" : "which"
  try {
    const result = execFileSync(which, ["ast-grep"], { stdio: "pipe" }).toString().trim().split(/\r?\n/)[0]
    if (result) {
      cachedBin = result
      return result
    }
  } catch {
    // Not installed on PATH.
  }
  cachedBin = null
  return null
}

function formatMatch(file: string, line: number, col: number, text: string): string {
  const lines = text.split("\n")
  const out = [`  ${file}:${line}:${col}`]
  for (let i = 0; i < Math.min(lines.length, 5); i++) out.push(`${i === 0 ? "    >" : "     "} ${lines[i]}`)
  if (lines.length > 5) out.push(`     ... (${lines.length - 5} more lines)`)
  return out.join("\n")
}

export async function runCodeSearch(input: CodeSearchInput): Promise<string> {
  const langInput = input.lang.toLowerCase().trim()
  const lang = LANG_ALIASES[langInput]
  if (!lang) {
    const supported = [...new Set(Object.values(LANG_ALIASES))].join(", ")
    return `Error: unsupported language "${input.lang}". Supported: ${supported}.`
  }

  const projectDir = path.resolve(input.cwd ?? process.cwd())
  const searchPath = path.resolve(projectDir, input.path ?? ".")
  if (!fs.existsSync(searchPath)) return `Error: path not found: ${searchPath}`

  const bin = findAstGrep(projectDir)
  if (!bin) {
    return `Error: ast-grep not found. Install @ast-grep/cli locally or put ast-grep on PATH.`
  }

  let raw = ""
  let spawnErr: string | null = null
  try {
    const { stdout, stderr } = await exec(bin, ["run", "--pattern", input.pattern, "--lang", lang, "--json=compact", searchPath], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 60_000,
    })
    raw = stdout
    if (stderr.trim()) spawnErr = stderr.trim().split(/\r?\n/)[0] ?? null
  } catch (error) {
    const err = error as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string }
    raw = err.stdout?.toString() ?? ""
    const stderr = err.stderr?.toString() ?? err.message ?? String(error)
    if (stderr.trim()) spawnErr = stderr.trim().split(/\r?\n/)[0] ?? null
  }

  const parseErrors: string[] = []
  let allMatches: AstGrepMatch[] = []
  try {
    const parsed = JSON.parse(raw || "[]") as unknown
    if (Array.isArray(parsed)) allMatches = parsed as AstGrepMatch[]
    else parseErrors.push(`ast-grep returned non-array JSON: ${typeof parsed}`)
  } catch (error) {
    parseErrors.push(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (spawnErr) parseErrors.push(`ast-grep stderr: ${spawnErr}`)

  const withMtime = await Promise.all(
    allMatches.map(async (match) => {
      try {
        return { match, mtime: (await fs.promises.stat(match.file)).mtimeMs }
      } catch {
        return { match, mtime: 0 }
      }
    }),
  )
  withMtime.sort((a, b) => b.mtime - a.mtime)

  const max = input.maxResults ?? 30
  const shown = withMtime.slice(0, max).map((item) => item.match)
  const lines = [`codesearch: pattern="${input.pattern}" lang=${lang} path=${searchPath}`]
  lines.push(`  matches: ${withMtime.length}${withMtime.length > max ? ` (showing first ${max})` : ""}`)
  lines.push("")

  if (shown.length === 0) lines.push("  No matches.")
  for (const match of shown) {
    const start = match.range?.start ?? { line: 0, column: 0 }
    const file = match.file ? path.relative(projectDir, match.file) : "?"
    lines.push(formatMatch(file, (start.line ?? 0) + 1, (start.column ?? 0) + 1, match.text ?? ""))
  }

  if (parseErrors.length > 0) {
    lines.push("", `Errors (${parseErrors.length}):`)
    for (const err of parseErrors.slice(0, 5)) lines.push(`  ${err}`)
  }
  return lines.join("\n")
}
