import fs from "node:fs/promises"
import path from "node:path"

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", ".nuxt", ".turbo", "out", "target", "vendor"])
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

interface ImportDecl {
  rawPath: string
  isLocal: boolean
}

interface TypeDef {
  name: string
  kind: "interface" | "type" | "enum" | "class" | "struct"
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
  kind: TypeDef["kind"]
  module: string
  file: string
  line: number
}

const tsParser: Parser = {
  name: "TypeScript",
  extensions: ["ts", "tsx", "js", "jsx", "mjs"],
  extractImports(content) {
    const imports: ImportDecl[] = []
    const patterns = [/import\s+(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g, /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /export\s+(?:\w+\s+)?(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g]
    for (const re of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) imports.push({ rawPath: match[1] ?? "", isLocal: /^[./]/.test(match[1] ?? "") })
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
    const patterns: Array<[RegExp, TypeDef["kind"]]> = [[/(export\s+)?interface\s+(\w+)/g, "interface"], [/(export\s+)?type\s+(\w+)\s*=/g, "type"], [/(export\s+)?enum\s+(\w+)/g, "enum"], [/(export\s+)?class\s+(\w+)/g, "class"]]
    for (const [re, kind] of patterns) {
      let match: RegExpExecArray | null
      while ((match = re.exec(content)) !== null) defs.push({ name: match[2] ?? "", kind, exported: Boolean(match[1]), line: content.slice(0, match.index).split("\n").length })
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
      while ((match = re.exec(content)) !== null) imports.push({ rawPath: match[1] ?? "", isLocal: (match[1] ?? "").startsWith(".") })
    }
    return imports
  },
  parseTypeDefs(content) {
    const defs: TypeDef[] = []
    const re = /(?:^|\n)class\s+(\w+)\s*(?:\([^)]*\))?\s*:/g
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      const name = match[1] ?? ""
      defs.push({ name, kind: "class", exported: !name.startsWith("_"), line: content.slice(0, match.index).split("\n").length + 1 })
    }
    return defs
  },
  isLocalImport: (rawPath) => rawPath.startsWith("."),
  normalizeImportPath(rawPath, fromFile, srcDir) {
    const fromDir = path.dirname(fromFile)
    const cleaned = rawPath.replace(/^\.+/, "").replace(/\./g, "/")
    const resolved = rawPath.startsWith(".") ? path.resolve(srcDir, fromDir, cleaned) : path.resolve(srcDir, cleaned)
    const relative = path.relative(srcDir, resolved)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null
    return relative.replace(/\\/g, "/")
  },
}

const simpleParsers: Parser[] = [
  tsParser,
  pyParser,
  makeRegexParser("Go", ["go"], [/import\s+(?:\w+\s+)?"([^"]+)"/g], [[/type\s+(\w+)\s+struct\s*\{/g, "struct"], [/type\s+(\w+)\s+interface\s*\{/g, "interface"]]),
  makeRegexParser("Rust", ["rs"], [/^use\s+([\w:]+).*;/gm, /^mod\s+(\w+)\s*[;{]/gm], [[/(pub\s+)?struct\s+(\w+)/g, "struct"], [/(pub\s+)?enum\s+(\w+)/g, "enum"], [/(pub\s+)?trait\s+(\w+)/g, "interface"]]),
  makeRegexParser("C#", ["cs"], [/^using\s+(?:\w+\s*=\s*)?([\w.]+)\s*;/gm], [[/(public\s+)?(?:class|record)\s+(\w+)/g, "class"], [/(public\s+)?struct\s+(\w+)/g, "struct"], [/(public\s+)?interface\s+(\w+)/g, "interface"], [/(public\s+)?enum\s+(\w+)/g, "enum"]]),
  makeRegexParser("C++", ["cpp", "cxx", "cc", "c", "hpp", "hxx", "h", "hh"], [/^#\s*include\s*"([^"]+)"/gm], [[/(?:class|struct)\s+(\w+)\s*[{:\n]/g, "struct"], [/(?:enum\s+class|enum)\s+(\w+)/g, "enum"]]),
]

function makeRegexParser(name: string, extensions: string[], importPatterns: RegExp[], typePatterns: Array<[RegExp, TypeDef["kind"]]>): Parser {
  return {
    name,
    extensions,
    extractImports(content) {
      const imports: ImportDecl[] = []
      for (const re of importPatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) imports.push({ rawPath: match[1] ?? "", isLocal: true })
      }
      return imports
    },
    parseTypeDefs(content) {
      const defs: TypeDef[] = []
      for (const [re, kind] of typePatterns) {
        let match: RegExpExecArray | null
        while ((match = re.exec(content)) !== null) {
          const nameIndex = match.length > 2 ? 2 : 1
          defs.push({ name: match[nameIndex] ?? "", kind, exported: match[1] === "pub " || match[1] === "public " || match.length === 2, line: content.slice(0, match.index).split("\n").length })
        }
      }
      return defs
    },
    isLocalImport: () => true,
    normalizeImportPath(rawPath, fromFile, srcDir) {
      const relative = rawPath.includes("::") ? rawPath.replace(/^crate::/, "").replace(/::/g, "/") : rawPath
      const resolved = path.resolve(srcDir, path.dirname(fromFile), relative)
      const rel = path.relative(srcDir, resolved)
      if (rel.startsWith("..") || path.isAbsolute(rel)) return null
      return stripExtension(rel.replace(/\\/g, "/"))
    },
  }
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx|mjs|py|go|rs|cs|cpp|cxx|cc|c|hpp|hxx|hh|h)$/, "")
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

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/")
  let out = "^"
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    const next = normalized[i + 1]
    if (char === "*" && next === "*") {
      out += ".*"
      i++
    } else if (char === "*") {
      out += "[^/]*"
    } else if (char === "?") {
      out += "[^/]"
    } else {
      out += char?.replace(/[|\\{}()[\]^$+?.]/g, "\\$&") ?? ""
    }
  }
  out += "$"
  return new RegExp(out)
}

function isExcluded(relFile: string, patterns: string[]): boolean {
  const normalized = relFile.replace(/\\/g, "/")
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized))
}

function isEntryPoint(module: string, entryPoints: string[]): boolean {
  return entryPoints.some((entry) => entry === module || globToRegExp(entry).test(module))
}

function selectParsers(files: string[], explicitLangs?: string[]): Parser[] {
  if (explicitLangs && explicitLangs.length > 0) {
    const wanted = new Set(explicitLangs.map((lang) => lang.toLowerCase()))
    return simpleParsers.filter((parser) => wanted.has(parser.name.toLowerCase()) || parser.extensions.some((ext) => wanted.has(ext)))
  }
  const extSet = new Set(files.map((file) => path.extname(file).slice(1).toLowerCase()))
  return simpleParsers.filter((parser) => parser.extensions.some((ext) => extSet.has(ext)))
}

export async function runDeadCode(input: DeadCodeInput): Promise<string> {
  const projectDir = path.resolve(input.cwd ?? process.cwd())
  const srcDir = path.resolve(projectDir, input.entry ?? ".")
  try {
    const stat = await fs.stat(srcDir)
    if (!stat.isDirectory()) return `Error: ${input.entry ?? "."} is not a directory`
  } catch {
    return `Error: ${input.entry ?? "."} not found`
  }

  const excludePatterns = [
    ...(input.include_default_excludes === false ? [] : DEFAULT_EXCLUDES),
    ...(input.exclude ?? []),
  ]
  const files = (await listFiles(srcDir))
    .filter((filePath) => !isExcluded(path.relative(srcDir, filePath).replace(/\\/g, "/"), excludePatterns))
  const parsers = selectParsers(files, input.lang)
  const extToParser = new Map<string, Parser>()
  for (const parser of parsers) parser.extensions.forEach((ext) => extToParser.set(ext, parser))

  const graph = new Map<string, Set<string>>()
  const reverse = new Map<string, Set<string>>()
  const symbols: ExportedSymbol[] = []

  for (const filePath of files) {
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
      if (normalized) targets.add(normalized)
    }

    graph.set(moduleKey, targets)
    if (!reverse.has(moduleKey)) reverse.set(moduleKey, new Set())
    for (const target of targets) {
      if (!reverse.has(target)) reverse.set(target, new Set())
      reverse.get(target)?.add(moduleKey)
    }

    for (const def of parser.parseTypeDefs(content)) {
      if (def.exported && def.name) symbols.push({ name: def.name, kind: def.kind, module: moduleKey, file: relFile, line: def.line })
    }
  }

  if (graph.size === 0) return `No source files found in ${input.entry ?? "."}`

  const entryPoints = input.entry_points ?? DEFAULT_ENTRIES
  const minExports = input.min_exports ?? 1
  const deadModules = [...reverse.entries()]
    .filter(([module, dependents]) => !isEntryPoint(module, entryPoints) && dependents.size === 0 && graph.has(module))
    .map(([module]) => ({ module, exportedSymbols: symbols.filter((symbol) => symbol.module === module) }))
    .filter((item) => item.exportedSymbols.length >= minExports)
    .sort((a, b) => b.exportedSymbols.length - a.exportedSymbols.length)

  const parts = [`## Dead Code: ${input.entry ?? "."}`]
  parts.push(`Languages: ${parsers.map((parser) => parser.name).join(", ") || "none"} | Modules: ${graph.size} | Exported symbols: ${symbols.length} | Dead modules: ${deadModules.length}`)
  if (excludePatterns.length > 0) parts.push(`Excludes: ${excludePatterns.length} pattern(s) applied`)
  parts.push("")
  if (deadModules.length === 0) {
    parts.push("No dead modules detected. Treat this as a heuristic result, not proof that no dead code exists.")
    return parts.join("\n")
  }

  const totalDeadExports = deadModules.reduce((sum, module) => sum + module.exportedSymbols.length, 0)
  parts.push("### Summary")
  parts.push(`  Dead modules: ${deadModules.length} | Dead exports: ${totalDeadExports} / ${symbols.length}`)
  parts.push("", "### Dead Modules (0 dependents)")
  for (const deadModule of deadModules.slice(0, 30)) {
    parts.push(`  ${deadModule.module}/ (${deadModule.exportedSymbols.length} dead exports)`)
    for (const symbol of deadModule.exportedSymbols.slice(0, 10)) parts.push(`    - ${symbol.kind} ${symbol.name} (${symbol.file}:${symbol.line})`)
    if (deadModule.exportedSymbols.length > 10) parts.push(`    ... and ${deadModule.exportedSymbols.length - 10} more`)
  }
  parts.push("", "Note: dynamic imports, framework routes, plugin entrypoints, and CLI entrypoints can be false positives.")
  return parts.join("\n")
}
