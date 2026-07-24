import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { resolveContainedPath } from "../src/path-safety.js"

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
