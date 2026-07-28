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
  "**/examples/**",
  "**/example/**",
]

type SymbolKind = "interface" | "type" | "enum" | "class" | "struct" | "function" | "variable"

interface ImportDecl {
  rawPath: string
  isLocal: boolean
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
  isLocalImport(rawPath: string): boolean
  normalizeImportPath(rawPath: string, fromFile: string, srcDir: string): string | null
}

export interface DeadCodeInput {
  entry?: string
  entry_points?: string[]
  min_exports?: number
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

const tsParser: Parser = {
  name: "TypeScript",
  extensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs"],
  extractImports(content) {
    const imports: ImportDecl[] = []
    const patterns = [
      /import\s+(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+(?:type\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        const rawPath = match[1] ?? ""
        imports.push({ rawPath, isLocal: /^[./]/.test(rawPath) })
      }
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
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
      while ((match = re.exec(content)) !== null) {
        defs.push({
          name: match[nameIndex] ?? "",
          kind,
          exported: Boolean(match[1]),
          line: lineAt(content, match.index),
        })
      }
    }
    return defs
  },
  isLocalImport: (rawPath) => /^[./]/.test(rawPath),
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
    const patterns = [/^import\s+([.\w]+)/gm, /^from\s+([.\w]+)\s+import\s+[.\w,\s]+/gm]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) {
        const rawPath = match[1] ?? ""
        imports.push({ rawPath, isLocal: rawPath.startsWith(".") })
      }
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
    const re = /(?:^|\n)class\s+(\w+)\s*(?:\([^)]*\))?\s*:/g
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1] ?? ""
      defs.push({ name, kind: "class", exported: !name.startsWith("_"), line: lineAt(content, match.index) + 1 })
    }
    return defs
  },
  isLocalImport: (rawPath) => rawPath.startsWith("."),
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
      for (const re of importPatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          imports.push({ rawPath: match[1] ?? "", isLocal: true })
        }
      }
      return imports
    },
    parseTypeDefs(content) {
      const defs: TypeDef[] = []
      for (const [re, kind] of typePatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          const nameIndex = match.length > 2 ? 2 : 1
          defs.push({
            name: match[nameIndex] ?? "",
            kind,
            exported: match[1] === "pub " || match[1] === "public " || match.length === 2,
            line: lineAt(content, match.index),
          })
        }
      }
      return defs
    },
    isLocalImport: () => true,
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
      if (!decl.isLocal && !parser.isLocalImport(decl.rawPath)) continue
      const normalized = parser.normalizeImportPath(decl.rawPath, relFile, srcDir)
      if (normalized) targets.add(resolveModuleKey(normalized, moduleKeys))
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

  const entryPoints = input.entry_points ?? DEFAULT_ENTRIES
  const roots = [...graph.keys()].filter((module) => isEntryPoint(module, entryPoints))
  const minExports = input.min_exports ?? 1
  const reachable = findReachable(graph, roots)
  const candidates = roots.length > 0
    ? [...graph.keys()].filter((module) => !reachable.has(module))
    : [...graph.keys()].filter((module) => (reverse.get(module)?.size ?? 0) === 0)

  const deadModules = candidates
    .filter((module) => !isEntryPoint(module, entryPoints))
    .map((module) => ({ module, exportedSymbols: symbols.filter((symbol) => symbol.module === module) }))
    .filter((item) => item.exportedSymbols.length >= minExports)
    .sort((a, b) => b.exportedSymbols.length - a.exportedSymbols.length || a.module.localeCompare(b.module))

  const mode = roots.length > 0
    ? `unreachable from ${roots.length} entry point(s)`
    : "zero inbound dependencies (no configured entry point matched)"
  const parts = [`## Dead Module Candidates: ${input.entry ?? "."}`]
  parts.push(
    `Languages: ${parsers.map((parser) => parser.name).join(", ") || "none"} | Modules: ${graph.size} | Exported symbols: ${symbols.length} | Candidates: ${deadModules.length}`,
  )
  parts.push(`Analysis: ${mode}`)
  if (excludePatterns.length > 0) parts.push(`Excludes: ${excludePatterns.length} pattern(s) applied`)
  parts.push("")

  if (deadModules.length === 0) {
    parts.push("No dead-module candidates detected. This heuristic result is not proof that no dead code exists.")
    return parts.join("\n")
  }

  const totalDeadExports = deadModules.reduce((sum, module) => sum + module.exportedSymbols.length, 0)
  parts.push("### Summary")
  parts.push(`  Candidate modules: ${deadModules.length} | Candidate exports: ${totalDeadExports} / ${symbols.length}`)
  parts.push("", "### Candidate Modules")
  for (const deadModule of deadModules.slice(0, 30)) {
    parts.push(`  ${deadModule.module}/ (${deadModule.exportedSymbols.length} exported symbols)`)
    for (const symbol of deadModule.exportedSymbols.slice(0, 10)) {
      parts.push(`    - ${symbol.kind} ${symbol.name} (${symbol.file}:${symbol.line})`)
    }
    if (deadModule.exportedSymbols.length > 10) {
      parts.push(`    ... and ${deadModule.exportedSymbols.length - 10} more`)
    }
  }
  parts.push(
    "",
    "Note: dynamic imports, path aliases, framework routes, plugin entrypoints, and CLI entrypoints can produce false positives.",
  )
  return parts.join("\n")
}
