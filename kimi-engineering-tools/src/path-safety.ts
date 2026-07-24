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
