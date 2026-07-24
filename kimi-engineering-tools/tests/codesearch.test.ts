import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { runCodeSearch } from "../src/tools/codesearch.js"

test("executes a project-local ast-grep npm shim on Windows", { skip: process.platform !== "win32" }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-code-search-test-"))
  try {
    const binDirectory = path.join(directory, "node_modules", ".bin")
    await fs.mkdir(binDirectory, { recursive: true })
    await fs.writeFile(path.join(binDirectory, "ast-grep.cmd"), "@echo off\r\necho []\r\n")
    await fs.writeFile(path.join(directory, "sample.ts"), "console.log(1)")

    const output = await runCodeSearch({
      cwd: directory,
      path: ".",
      pattern: "console.log($$$)",
      lang: "typescript",
    })

    assert.match(output, /matches: 0/)
    assert.doesNotMatch(output, /spawn EINVAL/)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test("uses independent ast-grep discovery for different projects", async () => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-code-search-first-"))
  const second = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-code-search-second-"))
  try {
    if (process.platform === "win32") {
      for (const directory of [first, second]) {
        const binDirectory = path.join(directory, "node_modules", ".bin")
        await fs.mkdir(binDirectory, { recursive: true })
        await fs.writeFile(path.join(binDirectory, "ast-grep.cmd"), "@echo off\r\necho []\r\n")
      }
    }
    await fs.writeFile(path.join(first, "sample.ts"), "export const first = 1")
    await fs.writeFile(path.join(second, "sample.ts"), "export const second = 2")

    const firstOutput = await runCodeSearch({ cwd: first, pattern: "const $A = $B", lang: "typescript" })
    const secondOutput = await runCodeSearch({ cwd: second, pattern: "const $A = $B", lang: "typescript" })

    assert.doesNotMatch(firstOutput, /path not found/)
    assert.doesNotMatch(secondOutput, /path not found/)
  } finally {
    await fs.rm(first, { recursive: true, force: true })
    await fs.rm(second, { recursive: true, force: true })
  }
})

test("rejects path that escapes the project root", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-code-search-escape-"))
  try {
    await fs.writeFile(path.join(directory, "sample.ts"), "export const x = 1")
    const output = await runCodeSearch({
      cwd: directory,
      path: "..",
      pattern: "const $A = $B",
      lang: "typescript",
    })
    assert.match(output, /escapes project root/)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
