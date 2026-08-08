import fs from "node:fs/promises"
import path from "node:path"
import { minimatch } from "minimatch"
import { resolveProjectTarget } from "../path-safety.js"

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  "out",
  "target",
  "vendor",
])

const DEFAULT_ENTRIES = [
  "index",
  "main",
  "app",
  "server",
  "cli",
  "mod",
  "lib",
  "src/index",
  "src/main",
  "src/app",
  "packages/*/index",
  "packages/*/src/index",
  "packages/*/src/main",
]

const DEFAULT_EXCLUDES = [
  "**/*.d.ts",
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.stories.*",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/.storybook/**",
  "**/storybook/**",
  "**/stories/**",
  "**/test/**",
  "**/tests/**",
  "**/fixtures/**",
  "**/mocks/**",
  "**/generated/**",
  "**/__generated__/**",
  "**/gen/**",
  "**/*.gen.*",
  "**/icons/**",
  "**/examples/**",
  "**/example/**",
]

type SymbolKind = "interface" | "type" | "enum" | "class" | "struct" | "function" | "variable"

interface ImportDecl {
  rawPath: string
}

interface TypeDef {
  name: string
  kind: SymbolKind
  exported: boolean
  line: number
}

interface Parser {
  name: string
  extensions: string[]
  extractImports(content: string): ImportDecl[]
  parseTypeDefs(content: string): TypeDef[]
  normalizeImportPath(rawPath: string, fromFile: string, srcDir: string): string | null
}

export interface DeadCodeInput {
  entry?: string
  entry_points?: string[]
  min_exports?: number
  min_confidence?: "high" | "medium" | "low"
  lang?: string[]
  exclude?: string[]
  include_default_excludes?: boolean
  cwd?: string
}

interface ExportedSymbol {
  name: string
  kind: SymbolKind
  module: string
  file: string
  line: number
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length
}

/**
 * Mask of characters that survive comment/string stripping (1 = kept).
 * Characters inside comments, string literals, and template literals become 0
 * (newlines stay 1 so line-based parsing still works). Used by import
 * extraction to reject import text that only appears inside a literal.
 */
function commentsAndLiteralsMask(content: string, lang: "c" | "python"): Uint8Array {
  const mask = new Uint8Array(content.length).fill(1)
  const n = content.length
  const erase = (from: number, to: number) => {
    for (let k = from; k < Math.min(to, n); k++) mask[k] = 0
  }
  let i = 0
  if (lang === "python") {
    while (i < n) {
      const c = content[i]
      if (c === "#") {
        while (i < n && content[i] !== "\n") { mask[i] = 0; i++ }
      } else if (c === "'" || c === '"') {
        const quote = c
        const triple = content[i + 1] === quote && content[i + 2] === quote
        const len = triple ? 3 : 1
        erase(i, i + len)
        i += len
        while (i < n) {
          const ch = content[i]
          if (ch === "\\") { erase(i, i + 2); i += 2 }
          else if (triple ? ch === quote && content[i + 1] === quote && content[i + 2] === quote : ch === quote) {
            erase(i, i + (triple ? 3 : 1))
            i += triple ? 3 : 1
            break
          } else {
            erase(i, i + 1)
            i++
          }
        }
      } else {
        i++
      }
    }
  } else {
    // C-family: //, /* */, '...', "...", `...` (template literals with ${...} interpolation).
    const skipQuoted = (quote: string) => {
      erase(i, i + 1)
      i++
      while (i < n) {
        const ch = content[i]
        if (ch === "\\") { erase(i, i + 2); i += 2 }
        else if (ch === quote) { erase(i, i + 1); i++; return }
        else { erase(i, i + 1); i++ }
      }
    }
    const skipTemplate = (): void => {
      erase(i, i + 1)
      i++
      let depth = 0 // 0 = literal body; >0 = inside ${...} interpolation
      while (i < n) {
        const ch = content[i]
        if (ch === "\\") { erase(i, i + 2); i += 2 }
        else if (depth === 0 && ch === "`") { erase(i, i + 1); i++; return }
        else if (ch === "$" && content[i + 1] === "{") { erase(i, i + 2); i += 2; depth = 1 }
        else if (depth > 0) {
          if (ch === "{") depth++
          else if (ch === "}") depth--
          else if (ch === "'" || ch === '"') { skipQuoted(ch); continue }
          else if (ch === "`") { skipTemplate(); continue }
          erase(i, i + 1)
          i++
        } else {
          erase(i, i + 1)
          i++
        }
      }
    }
    while (i < n) {
      const c = content[i]
      const next = content[i + 1]
      if (c === "/" && next === "/") {
        while (i < n && content[i] !== "\n") { mask[i] = 0; i++ }
      } else if (c === "/" && next === "*") {
        erase(i, i + 2)
        i += 2
        while (i < n && !(content[i] === "*" && content[i + 1] === "/")) { erase(i, i + 1); i++ }
        if (i < n) { erase(i, i + 2); i += 2 }
      } else if (c === "'" || c === '"') {
        skipQuoted(c)
      } else if (c === "`") {
        skipTemplate()
      } else {
        i++
      }
    }
  }
  return mask
}

/** True when at least one character of [from, to) is real code, not a literal or comment. */
function hasLiveCode(mask: Uint8Array, from: number, to: number): boolean {
  for (let k = from; k < to && k < mask.length; k++) {
    if (mask[k] === 1) return true
  }
  return false
}

function stripCommentsAndLiterals(content: string, lang: "c" | "python"): string {
  const mask = commentsAndLiteralsMask(content, lang)
  const out = content.split("")
  for (let i = 0; i < content.length; i++) {
    if (mask[i] === 0 && out[i] !== "\n") out[i] = " "
  }
  return out.join("")
}

/**
 * Brace depth at the start of each line (0-based). Used to verify that an
 * `export` declaration sits at module top level and not inside a namespace,
 * module block, or function body.
 */
function computeLineStartDepths(content: string): number[] {
  const depths: number[] = [0]
  let depth = 0
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (c === "\n") {
      depths.push(depth)
    } else if (c === "{") {
      depth++
    } else if (c === "}") {
      depth = Math.max(0, depth - 1)
    }
  }
  return depths
}

function isTopLevelExport(stripped: string, index: number, lineDepths: number[]): boolean {
  let k = index
  while (k > 0 && stripped[k - 1] !== "\n") k--
  let depth = lineDepths[lineAt(stripped, index) - 1] ?? 0
  for (let j = k; j < index; j++) {
    if (stripped[j] === "{") depth++
    else if (stripped[j] === "}") depth = Math.max(0, depth - 1)
  }
  return depth === 0
}

const tsParser: Parser = {
  name: "TypeScript",
  extensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
  extractImports(content) {
    const imports: ImportDecl[] = []
    // 在原文上匹配（引号保留），再丢弃整条语句位于注释/字符串/模板字面量内的假 import：
    // 检查匹配起始处（关键字位置）是否为真实代码——路径本身总是被引号包裹，不能查路径。
    const mask = commentsAndLiteralsMask(content, "c")
    const patterns = [
      /import\s+(?:type\s+)?(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        if (hasLiveCode(mask, match.index, match.index + 1)) {
          imports.push({ rawPath: match[1] ?? "" })
        }
      }
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
    const code = stripCommentsAndLiterals(content, "c")
    const lineDepths = computeLineStartDepths(code)
    const patterns: Array<[RegExp, SymbolKind, number]> = [
      [/(export\s+)?interface\s+(\w+)/g, "interface", 2],
      [/(export\s+)?type\s+(\w+)\s*=/g, "type", 2],
      [/(export\s+)?(?:const\s+)?enum\s+(\w+)/g, "enum", 2],
      [/(export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/g, "class", 2],
      [/(export\s+)(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/g, "function", 2],
      [/(export\s+)(?:declare\s+)?(?:const|let|var)\s+(\w+)/g, "variable", 2],
    ]
    for (const [re, kind, nameIndex] of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(code)) !== null) {
        const exported = Boolean(match[1])
        // Exports inside namespaces/modules are not module-level symbols.
        if (exported && !isTopLevelExport(code, match.index, lineDepths)) continue
        defs.push({
          name: match[nameIndex] ?? "",
          kind,
          exported,
          line: lineAt(code, match.index),
        })
      }
    }
    return defs
  },
  normalizeImportPath(rawPath, fromFile, srcDir) {
    const resolved = path.resolve(srcDir, path.dirname(fromFile), rawPath)
    const relative = path.relative(srcDir, resolved)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null
    return stripExtension(relative.replace(/\\/g, "/"))
  },
}

const pyParser: Parser = {
  name: "Python",
  extensions: ["py"],
  extractImports(content) {
    const imports: ImportDecl[] = []
    const mask = commentsAndLiteralsMask(content, "python")
    const patterns = [/^import\s+([.\w]+)/gm, /^from\s+([.\w]+)\s+import\s+[.\w,\s]+/gm]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        if (hasLiveCode(mask, match.index, match.index + 1)) {
          imports.push({ rawPath: match[1] ?? "" })
        }
      }
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
    const code = stripCommentsAndLiterals(content, "python")
    const re = /(?:^|\n)class\s+(\w+)\s*(?:\([^)]*\))?\s*:/g
    let match: RegExpExecArray | null
    while ((match = re.exec(code)) !== null) {
      const name = match[1] ?? ""
      defs.push({ name, kind: "class", exported: !name.startsWith("_"), line: lineAt(code, match.index) + 1 })
    }
    return defs
  },
  normalizeImportPath(rawPath, fromFile, srcDir) {
    const fromDir = path.dirname(fromFile)
    const cleaned = rawPath.replace(/^\.+/, "").replace(/\./g, "/")
    const resolved = rawPath.startsWith(".")
      ? path.resolve(srcDir, fromDir, cleaned)
      : path.resolve(srcDir, cleaned)
    const relative = path.relative(srcDir, resolved)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null
    return relative.replace(/\\/g, "/")
  },
}

const simpleParsers: Parser[] = [
  tsParser,
  pyParser,
  makeRegexParser(
    "Go",
    ["go"],
    [/import\s+(?:\w+\s+)?"([^"]+)"/g],
    [[/type\s+(\w+)\s+struct\s*\{/g, "struct"], [/type\s+(\w+)\s+interface\s*\{/g, "interface"]],
  ),
  makeRegexParser(
    "Rust",
    ["rs"],
    [/^use\s+([\w:]+).*;/gm, /^mod\s+(\w+)\s*[;{]/gm],
    [[/(pub\s+)?struct\s+(\w+)/g, "struct"], [/(pub\s+)?enum\s+(\w+)/g, "enum"], [/(pub\s+)?trait\s+(\w+)/g, "interface"]],
  ),
  makeRegexParser(
    "C#",
    ["cs"],
    [/^using\s+(?:\w+\s*=\s*)?([\w.]+)\s*;/gm],
    [[/(public\s+)?(?:class|record)\s+(\w+)/g, "class"], [/(public\s+)?struct\s+(\w+)/g, "struct"], [/(public\s+)?interface\s+(\w+)/g, "interface"], [/(public\s+)?enum\s+(\w+)/g, "enum"]],
  ),
  makeRegexParser(
    "C++",
    ["cpp", "cxx", "cc", "c", "hpp", "hxx", "h", "hh"],
    [/^#\s*include\s*"([^"]+)"/gm],
    [[/(?:class|struct)\s+(\w+)\s*[{:\n]/g, "struct"], [/(?:enum\s+class|enum)\s+(\w+)/g, "enum"]],
  ),
]

function makeRegexParser(
  name: string,
  extensions: string[],
  importPatterns: RegExp[],
  typePatterns: Array<[RegExp, SymbolKind]>,
): Parser {
  return {
    name,
    extensions,
    extractImports(content) {
      const imports: ImportDecl[] = []
      const mask = commentsAndLiteralsMask(content, "c")
      for (const re of importPatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          if (hasLiveCode(mask, match.index, match.index + 1)) {
            imports.push({ rawPath: match[1] ?? "" })
          }
        }
      }
      return imports
    },
    parseTypeDefs(content) {
      const defs: TypeDef[] = []
      const code = stripCommentsAndLiterals(content, "c")
      for (const [re, kind] of typePatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(code)) !== null) {
          const nameIndex = match.length > 2 ? 2 : 1
          defs.push({
            name: match[nameIndex] ?? "",
            kind,
            exported: match[1] === "pub " || match[1] === "public " || match.length === 2,
            line: lineAt(code, match.index),
          })
        }
      }
      return defs
    },
    normalizeImportPath(rawPath, fromFile, srcDir) {
      const relative = rawPath.includes("::")
        ? rawPath.replace(/^crate::/, "").replace(/::/g, "/")
        : rawPath
      const resolved = path.resolve(srcDir, path.dirname(fromFile), relative)
      const rel = path.relative(srcDir, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) return null
      return stripExtension(rel.replace(/\\/g, "/"))
    },
  }
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|cs|cpp|cxx|cc|c|hpp|hxx|hh|h)$/, "")
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  async function walk(current: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(path.join(current, entry.name))
      } else if (entry.isFile()) {
        out.push(path.join(current, entry.name))
      }
    }
  }
  await walk(dir)
  return out
}

function isExcluded(relFile: string, patterns: string[]): boolean {
  const normalized = relFile.replace(/\\/g, "/")
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true, matchBase: true }))
}

function isEntryPoint(module: string, entryPoints: string[]): boolean {
  return entryPoints.some((entry) => entry === module || minimatch(module, entry, { dot: true }))
}

/**
 * Normalize a user-provided entry point to a module key (relative to srcDir, extension stripped).
 * Accepts file extensions (`src/main.ts`), `./` prefixes, backslashes, or absolute paths
 * (mapped inside srcDir automatically). Directory entries also get their `/index` key,
 * mirroring how imports are resolved.
 */
function normalizeEntryPoint(raw: string, srcDir: string, moduleKeys: Set<string>): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  let value: string
  if (path.isAbsolute(trimmed)) {
    const rel = path.relative(srcDir, path.resolve(trimmed))
    if (rel.startsWith("..") || path.isAbsolute(rel)) return []
    value = rel.replace(/\\/g, "/")
  } else {
    value = trimmed.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "")
  }
  value = stripExtension(value)
  if (!value) return []
  const keys = [value]
  if (!value.endsWith("/index") && moduleKeys.has(`${value}/index`)) keys.push(`${value}/index`)
  return keys
}

/**
 * Recursively collect every path-like string from a package.json `exports`
 * object (condition objects, arrays, string targets).
 */
function collectExportPaths(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    if (value.startsWith("./") && !value.endsWith(".json")) out.push(value.slice(2))
  } else if (Array.isArray(value)) {
    for (const item of value) collectExportPaths(item, out)
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectExportPaths(item, out)
  }
}

/**
 * Read the project package.json (plus every packages/<pkg>/package.json) and turn
 * `exports`/`main`/`module`/`types` targets into module keys. Dist output is
 * remapped to `src/` since the scan only indexes source files. Returns [] when
 * no package.json describes this tree.
 */
async function readPackageEntryKeys(srcDir: string): Promise<string[]> {
  const packageDirs = [""]
  try {
    const entries = await fs.readdir(path.join(srcDir, "packages"), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) packageDirs.push(path.join("packages", entry.name))
    }
  } catch {
    // No packages/ directory at this level.
  }
  const keys: string[] = []
  for (const dir of packageDirs) {
    let pkg: unknown
    try {
      pkg = JSON.parse(await fs.readFile(path.join(srcDir, dir, "package.json"), "utf8"))
    } catch {
      continue
    }
    if (pkg === null || typeof pkg !== "object") continue
    const record = pkg as Record<string, unknown>
    const rawPaths: string[] = []
    collectExportPaths(record.exports, rawPaths)
    for (const field of ["main", "module", "types"] as const) {
      if (typeof record[field] === "string") rawPaths.push(record[field])
    }
    for (const rawPath of rawPaths) {
      let rel = path.relative(srcDir, path.resolve(srcDir, dir, rawPath)).replace(/\\/g, "/")
      if (rel.startsWith("..") || path.isAbsolute(rel) || rel.includes("node_modules")) continue
      // Build output usually mirrors src/ in source-only scans.
      if (rel.startsWith("dist/")) rel = "src/" + rel.slice("dist/".length)
      const key = stripExtension(rel.replace(/\.d\.(ts|tsx)$/, ".$1"))
      if (key) keys.push(key)
    }
  }
  return [...new Set(keys)]
}

const NEXT_APP_ROUTE_FILES = new Set([
  "page",
  "layout",
  "route",
  "loading",
  "error",
  "not-found",
  "template",
  "default",
])
const ENTRY_SUBDIR_NAMES = new Set(["app", "core", "cli", "server", "lib", "cmd", "routes", "views", "pages", "main", "entries"])
// Electron: src/main|preload|renderer (with optional package prefix and /index).
const ELECTRON_ROLE_RE = /^(?:src|packages\/[^/]+(?:\/src)?)\/(main|preload|renderer)(?:\/index)?$/

/**
 * Derive entry points from the module tree itself when package.json says
 * nothing: Next.js app/pages routes, the Electron main|preload|renderer
 * layout, and top-level subdirectory indices of packages that lack a root
 * index (e.g. console/app/ + console/core/).
 */
function detectStructuralEntries(moduleKeys: Set<string>): string[] {
  const entries = new Set<string>()
  for (const key of moduleKeys) {
    const appIdx = key.indexOf("/app/")
    if (appIdx !== -1 && NEXT_APP_ROUTE_FILES.has(key.slice(appIdx + 5).split("/")[0] ?? "")) {
      entries.add(key)
    }
    if (key.includes("/pages/")) entries.add(key)
    if (ELECTRON_ROLE_RE.test(key)) entries.add(key)
    if (key.endsWith("/index")) {
      const segs = key.split("/")
      const subdir = segs[segs.length - 2] ?? ""
      if (!ENTRY_SUBDIR_NAMES.has(subdir)) continue
      // Only when the package/root itself has no index entry.
      if (segs[0] === "packages") {
        const pkg = segs[1] ?? ""
        if (moduleKeys.has(`packages/${pkg}/index`) || moduleKeys.has(`packages/${pkg}/src/index`)) continue
      } else if (segs[0] === "src") {
        if (moduleKeys.has("src/index")) continue
      } else if (segs.length === 2) {
        if (moduleKeys.has("index")) continue
      }
      entries.add(key)
    }
  }
  return [...entries]
}

function selectParsers(files: string[], explicitLangs?: string[]): Parser[] {
  if (explicitLangs && explicitLangs.length > 0) {
    const wanted = new Set(explicitLangs.map((lang) => lang.toLowerCase()))
    return simpleParsers.filter(
      (parser) => wanted.has(parser.name.toLowerCase()) || parser.extensions.some((ext) => wanted.has(ext)),
    )
  }
  const extSet = new Set(files.map((file) => path.extname(file).slice(1).toLowerCase()))
  return simpleParsers.filter((parser) => parser.extensions.some((ext) => extSet.has(ext)))
}

function resolveModuleKey(normalized: string, moduleKeys: Set<string>): string {
  if (moduleKeys.has(normalized)) return normalized
  const indexModule = `${normalized.replace(/\/$/, "")}/index`
  if (moduleKeys.has(indexModule)) return indexModule
  return normalized
}

function findReachable(graph: Map<string, Set<string>>, roots: string[]): Set<string> {
  const reachable = new Set<string>()
  const pending = [...roots]
  while (pending.length > 0) {
    const module = pending.pop()
    if (!module || reachable.has(module)) continue
    reachable.add(module)
    for (const dependency of graph.get(module) ?? []) {
      if (graph.has(dependency) && !reachable.has(dependency)) pending.push(dependency)
    }
  }
  return reachable
}

export async function runDeadCode(input: DeadCodeInput): Promise<string> {
  const resolved = resolveProjectTarget({
    cwd: input.cwd,
    target: input.entry,
    defaultTarget: ".",
  })
  if (!resolved.ok) return resolved.error
  const { projectDir, targetPath: srcDir } = resolved.result
  try {
    const stat = await fs.stat(srcDir)
    if (!stat.isDirectory()) return `Error: ${input.entry ?? "."} is not a directory`
  } catch {
    return `Error: ${input.entry ?? srcDir} not found`
  }

  const excludePatterns = [
    ...(input.include_default_excludes === false ? [] : DEFAULT_EXCLUDES),
    ...(input.exclude ?? []),
  ]
  const files = (await listFiles(srcDir)).filter(
    (filePath) => !isExcluded(path.relative(srcDir, filePath).replace(/\\/g, "/"), excludePatterns),
  )
  const parsers = selectParsers(files, input.lang)
  const extToParser = new Map<string, Parser>()
  for (const parser of parsers) parser.extensions.forEach((ext) => extToParser.set(ext, parser))

  const sourceFiles = files.filter((filePath) => extToParser.has(path.extname(filePath).slice(1).toLowerCase()))
  const moduleKeys = new Set(
    sourceFiles.map((filePath) => stripExtension(path.relative(srcDir, filePath).replace(/\\/g, "/"))),
  )
  const graph = new Map<string, Set<string>>()
  const reverse = new Map<string, Set<string>>()
  const symbols: ExportedSymbol[] = []

  for (const filePath of sourceFiles) {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const parser = extToParser.get(ext)
    if (!parser) continue
    const relFile = path.relative(srcDir, filePath).replace(/\\/g, "/")
    const moduleKey = stripExtension(relFile)
    const content = await fs.readFile(filePath, "utf8")
    const targets = new Set<string>()

    for (const decl of parser.extractImports(content)) {
      // Non-relative imports may still be in-tree absolute paths (Python src-layout
      // `from pkg.mod import x`, TS `packages/a/src/b`, tsconfig path aliases). Resolve
      // them against srcDir and keep the edge only when it lands on a real module key,
      // so npm/stdlib/unresolved aliases are naturally skipped.
      const normalized = parser.normalizeImportPath(decl.rawPath, relFile, srcDir)
      if (!normalized) continue
      const target = resolveModuleKey(normalized, moduleKeys)
      if (moduleKeys.has(target)) targets.add(target)
    }

    graph.set(moduleKey, targets)
    if (!reverse.has(moduleKey)) reverse.set(moduleKey, new Set())
    for (const target of targets) {
      if (!reverse.has(target)) reverse.set(target, new Set())
      reverse.get(target)?.add(moduleKey)
    }

    for (const def of parser.parseTypeDefs(content)) {
      if (def.exported && def.name) {
        symbols.push({ name: def.name, kind: def.kind, module: moduleKey, file: relFile, line: def.line })
      }
    }
  }

  if (graph.size === 0) return `No source files found in ${input.entry ?? "."}`

  // Entry discovery: explicit entry_points merged with built-in defaults, then
  // package.json exports (public API), then structural heuristics. Track each
  // source separately so the report says where the roots came from.
  const explicitKeys: string[] = []
  let rejectedEntries = 0
  for (const entry of [...DEFAULT_ENTRIES, ...(input.entry_points ?? [])]) {
    const keys = normalizeEntryPoint(entry, srcDir, moduleKeys)
    if (keys.length === 0) rejectedEntries++
    else explicitKeys.push(...keys)
  }
  const exportsKeys = await readPackageEntryKeys(srcDir)
  const structuralKeys = detectStructuralEntries(moduleKeys)
  const uniqueEntryPoints = [...new Set([...explicitKeys, ...exportsKeys, ...structuralKeys])]
  const matches = (patterns: string[]) => [...graph.keys()].filter((module) => isEntryPoint(module, patterns))
  const roots = matches(uniqueEntryPoints)
  const explicitRoots = matches([...new Set(explicitKeys)])
  const exportsRoots = matches(exportsKeys)
  const structuralRoots = matches(structuralKeys)

  const minExports = input.min_exports ?? 1
  const reachable = findReachable(graph, roots)
  const candidates = roots.length > 0
    ? [...graph.keys()].filter((module) => !reachable.has(module))
    : [...graph.keys()].filter((module) => (reverse.get(module)?.size ?? 0) === 0)

  type Confidence = "high" | "medium" | "low"
  const confidenceOf = (module: string): Confidence => {
    if (roots.length === 0) return "low"
    return (reverse.get(module)?.size ?? 0) === 0 ? "high" : "medium"
  }
  const confidenceRank: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

  const deadModules = candidates
    .filter((module) => !isEntryPoint(module, uniqueEntryPoints))
    .map((module) => ({
      module,
      exportedSymbols: symbols.filter((symbol) => symbol.module === module),
      confidence: confidenceOf(module),
    }))
    .filter((item) => item.exportedSymbols.length >= minExports)

  const minConfidence = input.min_confidence ?? "low"
  const filtered = deadModules
    .filter((item) => confidenceRank[item.confidence] >= confidenceRank[minConfidence])
    .sort(
      (a, b) =>
        confidenceRank[b.confidence] - confidenceRank[a.confidence] ||
        b.exportedSymbols.length - a.exportedSymbols.length ||
        a.module.localeCompare(b.module),
    )

  const mode = roots.length > 0
    ? `unreachable from ${roots.length} entry point(s)`
    : "zero inbound dependencies (no configured entry point matched)"
  const parts = [`## Dead Module Candidates: ${input.entry ?? "."}`]
  parts.push(
    `Languages: ${parsers.map((parser) => parser.name).join(", ") || "none"} | Modules: ${graph.size} | Exported symbols: ${symbols.length} | Candidates: ${filtered.length}${
      filtered.length !== deadModules.length ? ` (${deadModules.length} before min_confidence=${minConfidence})` : ""
    }`,
  )
  parts.push(`Analysis: ${mode}`)
  parts.push(
    `Entry points: ${roots.length} matched (built-in/explicit: ${explicitRoots.length}, package exports: ${exportsRoots.length}, structural: ${structuralRoots.length})`,
  )
  if (exportsRoots.length > 0) {
    parts.push(`Public API (package.json exports): ${exportsRoots.join(", ")}`)
  }
  if (excludePatterns.length > 0) parts.push(`Excludes: ${excludePatterns.length} pattern(s) applied`)
  parts.push("")

  if (roots.length === 0) {
    parts.push(
      `⚠ No configured entry point matched any module (checked ${uniqueEntryPoints.length} pattern(s)${
        rejectedEntries > 0 ? `, ${rejectedEntries} ignored for resolving outside the project` : ""
      }).`,
    )
    parts.push("  Module keys are relative to the analyzed directory and carry no file extension,")
    parts.push('  e.g. "src/main" or "packages/a/src/index". Absolute paths are mapped inside automatically.')
    parts.push(
      `  First modules: ${[...graph.keys()].slice(0, 6).join(", ")}${
        graph.size > 6 ? `, ... (${graph.size} total)` : ""
      }`,
    )
    parts.push("  The candidates below use the weak 'zero inbound dependencies' heuristic and include false positives.")
    parts.push("")
  }

  if (filtered.length === 0) {
    if (deadModules.length > 0) {
      parts.push(
        `No candidates at min_confidence=${minConfidence}; ${deadModules.length} lower-confidence candidate(s) filtered out.`,
      )
    } else {
      parts.push("No dead-module candidates detected. This heuristic result is not proof that no dead code exists.")
    }
    return parts.join("\n")
  }

  const totalDeadExports = filtered.reduce((sum, item) => sum + item.exportedSymbols.length, 0)
  const counts: Record<Confidence, number> = { high: 0, medium: 0, low: 0 }
  for (const item of filtered) counts[item.confidence]++
  parts.push("### Summary")
  parts.push(
    `  Candidate modules: ${filtered.length} | Candidate exports: ${totalDeadExports} / ${symbols.length} | High: ${counts.high} | Medium: ${counts.medium} | Low: ${counts.low}`,
  )
  parts.push("", "### Candidates by package")
  // Group candidates by top-level package (packages/<pkg>, src, or root files).
  const packageOf = (module: string): string => {
    const segs = module.split("/")
    if (segs[0] === "packages" && segs.length > 2) return `${segs[0]}/${segs[1]}`
    if (segs.length > 1) return segs[0]
    return "(root)"
  }
  const groups = new Map<string, typeof filtered>()
  for (const item of filtered.slice(0, 30)) {
    const group = packageOf(item.module)
    const list = groups.get(group)
    if (list) list.push(item)
    else groups.set(group, [item])
  }
  for (const [group, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    parts.push(`${group} (${items.length} module${items.length > 1 ? "s" : ""})`)
    for (const item of items) {
      parts.push(`  ${item.module}/ [${item.confidence}] (${item.exportedSymbols.length} exported symbols)`)
      for (const symbol of item.exportedSymbols.slice(0, 10)) {
        parts.push(`    - ${symbol.kind} ${symbol.name} (${symbol.file}:${symbol.line})`)
      }
      if (item.exportedSymbols.length > 10) {
        parts.push(`    ... and ${item.exportedSymbols.length - 10} more`)
      }
    }
  }
  parts.push(
    "",
    "Confidence: high = zero in-tree references; medium = referenced only by other unreachable modules; low = zero-inbound heuristic (no entry point matched).",
    "Note: dynamic imports, path aliases, framework routes, plugin entrypoints, and CLI entrypoints can produce false positives.",
  )
  return parts.join("\n")
}
