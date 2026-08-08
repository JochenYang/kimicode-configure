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
  /** "c" for C-family syntax, "python" for Python (drives the literal mask). */
  maskLang: "c" | "python"
  extractImports(content: string, mask?: Uint8Array): ImportDecl[]
  parseTypeDefs(content: string, mask?: Uint8Array): TypeDef[]
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
    // C-family: //, /* */, '...', "...", `...` (template literals with ${...} interpolation),
    // and /.../ regex literals. Regex detection is heuristic: '/' starts a regex only
    // after characters that cannot end a division operand (or at line start), and the
    // literal must close on the same line.
    const isRegexStart = (at: number): boolean => {
      let j = at - 1
      while (j >= 0 && /\s/.test(content[j] ?? "")) j--
      if (j < 0 || content[j] === "\n") return true
      if ("=(,:[!&|?{};".includes(content[j] ?? "")) return true
      // Keywords that expect an expression next (return /re/, typeof /re/, ...).
      const word = content.slice(Math.max(0, j - 20), j + 1).match(/([A-Za-z_$][\w$]*)$/)?.[1]
      return Boolean(
        word && /^(return|case|throw|typeof|instanceof|in|of|delete|void|yield|new)$/.test(word),
      )
    }
    const skipRegex = (): void => {
      // Scan ahead for the closing slash; only erase when the literal closes on this
      // line, so a false start (e.g. division across a line) leaves no damage.
      let end = i + 1
      let inClass = false
      while (end < n) {
        const ch = content[end]
        if (ch === "\\") { end += 2; continue }
        if (ch === "[") { inClass = true; end++; continue }
        if (ch === "]") { inClass = false; end++; continue }
        if (!inClass && ch === "/") break
        if (ch === "\n") return // not a regex literal after all
        end++
      }
      if (end >= n) return
      erase(i, end + 1)
      i = end + 1
    }
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
          else if (ch === "/" && isRegexStart(i)) { skipRegex(); continue }
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
      } else if (c === "r" && content[i + 1] === "#") {
        // Rust raw string r#"..."# (r##"..."##, ...). Raw identifiers (r#type)
        // don't reach this branch: the char after the #'s must be a quote.
        let hashes = 0
        let quoteAt = i + 1
        while (quoteAt < n && content[quoteAt] === "#") { hashes++; quoteAt++ }
        if (content[quoteAt] === '"') {
          let k = quoteAt + 1
          while (k < n) {
            if (content[k] === '"') {
              let h = k + 1
              let matched = 0
              while (h < n && content[h] === "#" && matched < hashes) { matched++; h++ }
              if (matched === hashes) {
                erase(i, h)
                i = h
                break
              }
            }
            k++
          }
          if (k >= n) { erase(i, n); i = n }
        } else {
          i++
        }
      } else if (c === "'" || c === '"') {
        skipQuoted(c)
      } else if (c === "`") {
        skipTemplate()
      } else if (c === "/" && isRegexStart(i)) {
        skipRegex()
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

function stripCommentsAndLiterals(content: string, lang: "c" | "python", mask?: Uint8Array): string {
  const m = mask ?? commentsAndLiteralsMask(content, lang)
  const out = content.split("")
  for (let i = 0; i < content.length; i++) {
    if (m[i] === 0 && out[i] !== "\n") out[i] = " "
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
  maskLang: "c",
  extractImports(content, mask) {
    const imports: ImportDecl[] = []
    // 在原文上匹配（引号保留），再丢弃整条语句位于注释/字符串/模板字面量内的假 import：
    // 检查匹配起始处（关键字位置）是否为真实代码——路径本身总是被引号包裹，不能查路径。
    const m = mask ?? commentsAndLiteralsMask(content, "c")
    const patterns = [
      /import\s*(?:type\s+)?(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        if (hasLiveCode(m, match.index, match.index + 1)) {
          imports.push({ rawPath: match[1] ?? "" })
        }
      }
    }
    return imports
  },
  parseTypeDefs(content, mask) {
    const defs: TypeDef[] = []
    const code = stripCommentsAndLiterals(content, "c", mask)
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
  maskLang: "python",
  extractImports(content, mask) {
    const imports: ImportDecl[] = []
    const m = mask ?? commentsAndLiteralsMask(content, "python")
    // 单行限定：`\s` 含换行，贪婪的 `[.\w,\s]+` 会把后续相邻 import 行全部吞进
    // 第一个匹配，导致第二条起的边丢失（P1-1）。括号续行形式不做支持（保守）。
    const patterns = [
      /^import\s+([.\w]+)/gm,
      /^from\s+([.\w]+)\s+import\s+[.\w]+(?:\s+as\s+[.\w]+)?(?:\s*,\s*[.\w]+(?:\s+as\s+[.\w]+)?)*/gm,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        if (hasLiveCode(m, match.index, match.index + 1)) {
          imports.push({ rawPath: match[1] ?? "" })
        }
      }
    }
    return imports
  },
  parseTypeDefs(content, mask) {
    const defs: TypeDef[] = []
    const code = stripCommentsAndLiterals(content, "python", mask)
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
    [/^[ \t]*use\s+([\w:]+).*;/gm, /^[ \t]*mod\s+(\w+)\s*[;{]/gm],
    [[/(pub\s+)?struct\s+(\w+)/g, "struct"], [/(pub\s+)?enum\s+(\w+)/g, "enum"], [/(pub\s+)?trait\s+(\w+)/g, "interface"]],
    true,
  ),
  makeRegexParser(
    "C#",
    ["cs"],
    [/^[ \t]*using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/gm],
    [[/(public\s+)?(?:class|record)\s+(\w+)/g, "class"], [/(public\s+)?struct\s+(\w+)/g, "struct"], [/(public\s+)?interface\s+(\w+)/g, "interface"], [/(public\s+)?enum\s+(\w+)/g, "enum"]],
  ),
  makeRegexParser(
    "C++",
    ["cpp", "cxx", "cc", "c", "hpp", "hxx", "h", "hh"],
    [/^[ \t]*#\s*include\s*"([^"]+)"/gm],
    [[/(?:class|struct)\s+(\w+)\s*[{:\n]/g, "struct"], [/(?:enum\s+class|enum)\s+(\w+)/g, "enum"]],
  ),
]

function makeRegexParser(
  name: string,
  extensions: string[],
  importPatterns: RegExp[],
  typePatterns: Array<[RegExp, SymbolKind]>,
  stripFinalSegment = false,
): Parser {
  return {
    name,
    extensions,
    maskLang: "c",
    extractImports(content, mask) {
      const imports: ImportDecl[] = []
      const m = mask ?? commentsAndLiteralsMask(content, "c")
      for (const re of importPatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          if (hasLiveCode(m, match.index, match.index + 1)) {
            imports.push({ rawPath: match[1] ?? "" })
          }
        }
      }
      return imports
    },
    parseTypeDefs(content, mask) {
      const defs: TypeDef[] = []
      const code = stripCommentsAndLiterals(content, "c", mask)
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
      // Rust `use a::b::Item;` names the imported item last; drop it to keep the
      // module edge (a::b). `use a::b;` degrades to a — harmless, usually external.
      const pathPart = stripFinalSegment ? rawPath.replace(/:{1,2}[\w]+$/, "") : rawPath
      const relative = pathPart.includes("::")
        ? pathPart.replace(/^crate::/, "").replace(/::/g, "/")
        : pathPart
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
  value = path.posix.normalize(stripExtension(value.replace(/\.d\.(ts|tsx)$/, ".$1"))).replace(/^\.\//, "")
  if (!value || value === "." || value.startsWith("..")) return []
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

const BUILD_DIRS = new Set(["dist", "lib", "build", "out"])

/**
 * Read the project package.json (plus every packages/<pkg>/package.json) and turn
 * `exports`/`main`/`module`/`types` targets into module keys. Build output
 * (dist/lib/build/out) is remapped to src/ since the scan only indexes source
 * files; a missing mirror falls back to src/<basename>. Returns [] when no
 * package.json describes this tree.
 */
async function readPackageEntryKeys(srcDir: string, moduleKeys: Set<string>): Promise<string[]> {
  const packageDirs = [""]
  try {
    const entries = await fs.readdir(path.join(srcDir, "packages"), { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      packageDirs.push(path.join("packages", entry.name))
      if (entry.name.startsWith("@")) {
        // Scoped workspaces: packages/@scope/<name>
        const scoped = await fs.readdir(path.join(srcDir, "packages", entry.name), { withFileTypes: true })
        for (const sub of scoped) {
          if (sub.isDirectory()) packageDirs.push(path.join("packages", entry.name, sub.name))
        }
      }
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
      let key = stripExtension(rel.replace(/\.d\.(ts|tsx)$/, ".$1"))
      // Build output usually mirrors src/ in source-only scans. Locate the build
      // segment anywhere in the package path (packages/foo/dist/x.js), but never
      // remap a build-named segment that lives under an existing src/.
      const segments = rel.split("/")
      const srcIdx = segments.indexOf("src")
      const buildIdx = segments.findIndex((seg) => BUILD_DIRS.has(seg))
      if (buildIdx !== -1 && (srcIdx === -1 || buildIdx < srcIdx)) {
        const mirror = [...segments.slice(0, buildIdx), "src", ...segments.slice(buildIdx + 1)].join("/")
        const mirrorKey = stripExtension(mirror.replace(/\.d\.(ts|tsx)$/, ".$1"))
        const base = mirrorKey.slice(mirrorKey.lastIndexOf("/") + 1)
        key = moduleKeys.has(mirrorKey) ? mirrorKey : `src/${base}`
      }
      if (key) keys.push(key)
    }
  }
  return [...new Set(keys)]
}

/**
 * Read compilerOptions.paths from the nearest tsconfig.json (the analyzed dir,
 * then its parent) so `@/x`-style aliases resolve to real modules. Supports the
 * common `"@/*": ["src/*"]` star-suffix form; longest prefix wins.
 */
async function readTsconfigAliases(srcDir: string): Promise<Array<{ prefix: string; target: string }>> {
  const aliases: Array<{ prefix: string; target: string }> = []
  for (const dir of [srcDir, path.dirname(srcDir)]) {
    if (!dir) continue
    let raw: string
    try {
      raw = await fs.readFile(path.join(dir, "tsconfig.json"), "utf8")
    } catch {
      continue
    }
    let config: { compilerOptions?: { paths?: Record<string, string[]> } }
    try {
      config = JSON.parse(raw) as typeof config
    } catch {
      continue
    }
    for (const [key, targets] of Object.entries(config.compilerOptions?.paths ?? {})) {
      const target = targets?.[0]
      if (typeof target !== "string") continue
      const prefix = key.replace(/\*$/, "")
      if (!prefix) continue
      aliases.push({ prefix, target: target.replace(/\*$/, "") })
    }
    break // first readable tsconfig wins
  }
  aliases.sort((a, b) => b.prefix.length - a.prefix.length)
  return aliases
}

/** Rewrite an aliased import path to its real relative path, or null when no alias matches. */
function resolveAlias(
  rawPath: string,
  aliases: Array<{ prefix: string; target: string }>,
): string | null {
  for (const alias of aliases) {
    if (rawPath.startsWith(alias.prefix)) {
      return alias.target + rawPath.slice(alias.prefix.length)
    }
  }
  return null
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
const ELECTRON_ROLE_RE =
  /^(?:src|packages\/[^/]+(?:\/src)?|packages\/@[^/]+\/[^/]+(?:\/src)?)\/(main|preload|renderer)(?:\/index)?$/

/**
 * True when `dir` is the second segment of the module key and the first segment
 * is a legal framework root: the project root, `src/`, `packages/<pkg>/`,
 * `packages/<pkg>/src/`, or the scoped `packages/@scope/<pkg>` variants. Keeps
 * src/components/app/page.tsx-style false positives out.
 */
function isAtFrameworkRoot(segs: string[], dir: string): boolean {
  return (
    segs[0] === dir ||
    (segs[0] === "src" && segs[1] === dir) ||
    (segs[0] === "packages" && segs[1] !== undefined && segs[2] === dir) ||
    (segs[0] === "packages" && segs[1] !== undefined && segs[2] === "src" && segs[3] === dir) ||
    (segs[0] === "packages" && segs[1]?.startsWith("@") && segs[2] !== undefined && segs[3] === dir) ||
    (segs[0] === "packages" && segs[1]?.startsWith("@") && segs[2] === "src" && segs[3] !== undefined && segs[4] === dir)
  )
}

/**
 * Derive entry points from the module tree itself when package.json says
 * nothing: Next.js app/pages routes, the Electron main|preload|renderer
 * layout, and top-level subdirectory indices of packages that lack a root
 * index (e.g. console/app/ + console/core/).
 */
function detectStructuralEntries(moduleKeys: Set<string>): string[] {
  const entries = new Set<string>()
  for (const key of moduleKeys) {
    const segs = key.split("/")
    if (isAtFrameworkRoot(segs, "app")) {
      // app/<route-file>, src/app/<route-file>, packages/<pkg>/(src/)app/<route-file>
      const appAt = segs.indexOf("app")
      if (NEXT_APP_ROUTE_FILES.has(segs[appAt + 1] ?? "")) entries.add(key)
    }
    if (isAtFrameworkRoot(segs, "pages")) entries.add(key) // every file under pages/ is a route
    if (ELECTRON_ROLE_RE.test(key)) entries.add(key)
    if (key.endsWith("/index")) {
      const subdir = segs[segs.length - 2] ?? ""
      if (!ENTRY_SUBDIR_NAMES.has(subdir)) continue
      // The subdirectory must sit at a legal entry location (root, src/, package root).
      const subdirAt = segs.length - 2
      const scoped = segs[0] === "packages" && segs[1]?.startsWith("@")
      const atRoot = subdirAt === 0
      const atSrcRoot = subdirAt === 1 && segs[0] === "src"
      const atPkgRoot = subdirAt === 2 && segs[0] === "packages"
      const atPkgSrcRoot = subdirAt === 3 && segs[0] === "packages" && segs[2] === "src"
      const atScopeRoot = subdirAt === 4 && scoped
      const atScopeSrcRoot = subdirAt === 5 && scoped && segs[3] === "src"
      if (!(atRoot || atSrcRoot || atPkgRoot || atPkgSrcRoot || atScopeRoot || atScopeSrcRoot)) continue
      // Only when the package/root itself has no index entry.
      if (atPkgRoot || atPkgSrcRoot || atScopeRoot || atScopeSrcRoot) {
        const pkg = scoped ? `${segs[1]}/${segs[2]}` : segs[1] ?? ""
        if (moduleKeys.has(`packages/${pkg}/index`) || moduleKeys.has(`packages/${pkg}/src/index`)) continue
      } else if (atSrcRoot) {
        if (moduleKeys.has("src/index")) continue
      } else if (atRoot && segs.length === 2) {
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
  // Python: `from pkg import X` targets pkg/__init__.py. Harmless for other languages.
  const initModule = `${normalized.replace(/\/$/, "")}/__init__`
  if (moduleKeys.has(initModule)) return initModule
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
  const aliases = await readTsconfigAliases(srcDir)
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
    // One literal mask per file, shared by import and symbol extraction.
    const mask = commentsAndLiteralsMask(content, parser.maskLang)
    const targets = new Set<string>()

    for (const decl of parser.extractImports(content, mask)) {
      // Non-relative imports may still be in-tree absolute paths (Python src-layout
      // `from pkg.mod import x`, TS `packages/a/src/b`, tsconfig path aliases). Resolve
      // them against srcDir and keep the edge only when it lands on a real module key,
      // so npm/stdlib/unresolved aliases are naturally skipped.
      const aliased = resolveAlias(decl.rawPath, aliases)
      const normalized = parser.normalizeImportPath(
        aliased ?? decl.rawPath,
        aliased === null ? relFile : "",
        srcDir,
      )
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

    for (const def of parser.parseTypeDefs(content, mask)) {
      if (def.exported && def.name) {
        symbols.push({ name: def.name, kind: def.kind, module: moduleKey, file: relFile, line: def.line })
      }
    }
  }

  if (graph.size === 0) return `No source files found in ${input.entry ?? "."}`

  // Index symbols by module once so candidate grouping stays linear (P2-4).
  const symbolsByModule = new Map<string, ExportedSymbol[]>()
  for (const symbol of symbols) {
    const list = symbolsByModule.get(symbol.module)
    if (list) list.push(symbol)
    else symbolsByModule.set(symbol.module, [symbol])
  }

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
  const exportsKeys = await readPackageEntryKeys(srcDir, moduleKeys)
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
      exportedSymbols: symbolsByModule.get(module) ?? [],
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
