import path from "node:path"

/**
 * Resolve `candidate` against `root` and ensure the result stays inside root.
 * Returns the resolved absolute path, or an Error message string.
 */
export function resolveContainedPath(root: string, candidate: string): { ok: true; path: string } | { ok: false; error: string } {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, candidate)
  const relative = path.relative(resolvedRoot, resolved)

  // Empty relative means same path as root — allowed.
  // Absolute relative or ".." prefix means outside root (Windows drive jumps, etc.).
  if (relative === "") {
    return { ok: true, path: resolvedRoot }
  }
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`) || relative.startsWith("../") || relative.startsWith("..\\")) {
    return {
      ok: false,
      error: `Error: path escapes project root: ${candidate} (resolved to ${resolved}, root ${resolvedRoot})`,
    }
  }
  return { ok: true, path: resolved }
}

export interface ResolveProjectTargetInput {
  /** Optional project root from the tool call. Absolute preferred under plugin MCP. */
  cwd?: string
  /** Search / analysis target (codesearch.path or dead_code.entry). */
  target?: string
  /** Default target when omitted. */
  defaultTarget?: string
  /** Override process.cwd() (tests). */
  processCwd?: string
}

export interface ResolveProjectTargetResult {
  projectDir: string
  targetPath: string
}

function looksLikePluginInstallDir(dir: string): boolean {
  const normalized = dir.replace(/\\/g, "/").toLowerCase()
  return normalized.includes("/.kimi-code/plugins/") || normalized.includes("/plugins/managed/")
}

function absolutePathHint(processCwd: string): string {
  if (!looksLikePluginInstallDir(processCwd)) return ""
  return (
    ` Hint: this MCP server's process cwd is the plugin install dir (${processCwd}). ` +
    `Pass absolute cwd (workspace root) and/or absolute path/entry — relative paths resolve against the plugin dir, not the user workspace.`
  )
}

/**
 * Resolve the project root and target path for workspace tools.
 *
 * Plugin MCP servers pin process.cwd() to the plugin install directory, so
 * relative targets without an absolute cwd point at the wrong tree. Absolute
 * `cwd` or absolute `target` are accepted so callers can address the real
 * workspace. Relative targets still must stay inside the resolved project root.
 */
export function resolveProjectTarget(
  input: ResolveProjectTargetInput,
): { ok: true; result: ResolveProjectTargetResult } | { ok: false; error: string } {
  const processCwd = path.resolve(input.processCwd ?? process.cwd())
  const target = input.target ?? input.defaultTarget ?? "."
  const hasExplicitCwd = typeof input.cwd === "string" && input.cwd.trim() !== ""

  let projectDir: string

  if (hasExplicitCwd) {
    const cwdValue = input.cwd!.trim()
    projectDir = path.isAbsolute(cwdValue) ? path.resolve(cwdValue) : path.resolve(processCwd, cwdValue)
  } else if (path.isAbsolute(target)) {
    // Absolute target without cwd: treat the target itself as the project root.
    // Containment is then trivial (target is the root or a path under itself).
    const absoluteTarget = path.resolve(target)
    return { ok: true, result: { projectDir: absoluteTarget, targetPath: absoluteTarget } }
  } else {
    projectDir = processCwd
  }

  const contained = resolveContainedPath(projectDir, target)
  if (!contained.ok) {
    return {
      ok: false,
      error: contained.error + absolutePathHint(processCwd),
    }
  }

  return {
    ok: true,
    result: { projectDir, targetPath: contained.path },
  }
}

export function pathNotFoundError(searchPath: string, processCwd?: string): string {
  const cwd = path.resolve(processCwd ?? process.cwd())
  return `Error: path not found: ${searchPath}.${absolutePathHint(cwd)}`
}
