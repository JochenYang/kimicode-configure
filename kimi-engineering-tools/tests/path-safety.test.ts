import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { pathNotFoundError, resolveContainedPath, resolveProjectTarget } from "../src/path-safety.js"

const root = path.resolve("/project/root")

test("allows root itself and in-tree relative paths", () => {
  assert.equal(resolveContainedPath(root, ".").ok, true)
  assert.equal(resolveContainedPath(root, "src").ok, true)
  assert.equal(resolveContainedPath(root, "src/tools").ok, true)
  if (process.platform === "win32") {
    const winRoot = path.resolve("D:\\codes\\app")
    const result = resolveContainedPath(winRoot, "src")
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.path, path.resolve(winRoot, "src"))
  }
})

test("rejects parent traversal and absolute escape", () => {
  const parent = resolveContainedPath(root, "..")
  assert.equal(parent.ok, false)
  if (!parent.ok) assert.match(parent.error, /escapes project root/)

  const deep = resolveContainedPath(root, "src/../../outside")
  assert.equal(deep.ok, false)

  if (process.platform === "win32") {
    const abs = resolveContainedPath(path.resolve("D:\\codes\\app"), "C:\\Windows")
    assert.equal(abs.ok, false)
    if (!abs.ok) assert.match(abs.error, /escapes project root/)
  } else {
    const abs = resolveContainedPath(root, "/etc")
    assert.equal(abs.ok, false)
  }
})

test("resolveProjectTarget uses absolute cwd even when process cwd is a plugin dir", () => {
  const pluginDir = path.resolve("C:\\Users\\Administrator\\.kimi-code\\plugins\\managed\\kimi-engineering-tools")
  const workspace = path.resolve("D:\\codes\\kimi-code")
  const result = resolveProjectTarget({
    processCwd: pluginDir,
    cwd: workspace,
    target: "apps/kimi-code",
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.result.projectDir, workspace)
    assert.equal(result.result.targetPath, path.resolve(workspace, "apps/kimi-code"))
  }
})

test("resolveProjectTarget accepts absolute target without cwd", () => {
  const pluginDir = path.resolve("C:\\Users\\Administrator\\.kimi-code\\plugins\\managed\\kimi-engineering-tools")
  const absoluteTarget = path.resolve("D:\\codes\\kimi-code\\apps\\kimi-code")
  const result = resolveProjectTarget({
    processCwd: pluginDir,
    target: absoluteTarget,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.result.projectDir, absoluteTarget)
    assert.equal(result.result.targetPath, absoluteTarget)
  }
})

test("resolveProjectTarget still rejects relative escape from absolute cwd", () => {
  const workspace = path.resolve("D:\\codes\\kimi-code")
  const result = resolveProjectTarget({
    processCwd: path.resolve("C:\\Users\\Administrator\\.kimi-code\\plugins\\managed\\kimi-engineering-tools"),
    cwd: workspace,
    target: "..",
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /escapes project root/)
})

test("pathNotFoundError mentions plugin install dir when process cwd is managed plugin", () => {
  const pluginDir = path.resolve("C:\\Users\\Administrator\\.kimi-code\\plugins\\managed\\kimi-engineering-tools")
  const message = pathNotFoundError(path.join(pluginDir, "apps", "kimi-code"), pluginDir)
  assert.match(message, /path not found/)
  assert.match(message, /plugin install dir/)
  assert.match(message, /absolute/)
})
