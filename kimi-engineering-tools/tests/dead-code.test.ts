import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { runDeadCode } from "../src/tools/dead-code.js"

async function withProject(
  files: Record<string, string>,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-dead-code-test-"))
  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = path.join(directory, relativePath)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content)
    }
    await run(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

test("excludes root-level test files with default patterns", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "only.test.ts": "export class OnlyTest {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.doesNotMatch(output, /OnlyTest/)
    assert.match(output, /Modules: 1/)
  })
})

test("resolves directory imports to index modules", async () => {
  await withProject({
    "main.ts": 'import { X } from "./foo"; console.log(X)',
    "foo/index.ts": "export class X {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /Candidates: 0/)
    assert.doesNotMatch(output, /foo\/index\//)
  })
})

test("finds an unreachable import cycle from configured entry points", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "a.ts": 'import { B } from "./b"; export class A {}',
    "b.ts": 'import { A } from "./a"; export class B {}',
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /Candidates: 2/)
    assert.match(output, /class A/)
    assert.match(output, /class B/)
  })
})

test("recognizes exported functions and variables", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "unused.ts": "export function unused() {}\nexport const value = 1",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /function unused/)
    assert.match(output, /variable value/)
  })
})

test("rejects entry that escapes the project root", async () => {
  await withProject({
    "main.ts": "export class Main {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, entry: "..", lang: ["typescript"] })
    assert.match(output, /escapes project root/)
    assert.doesNotMatch(output, /## Dead Module Candidates/)
  })
})
