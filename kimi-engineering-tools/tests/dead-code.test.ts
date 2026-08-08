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

test("entry_points accept extensions, ./ prefixes, and absolute paths", async () => {
  await withProject({
    "packages/opencode/src/index.ts": 'export * from "./tui"',
    "packages/opencode/src/tui.ts": "export class Tui {}",
    "index.ts": 'import { Tui } from "./packages/opencode/src/tui"\nexport const m = Tui',
  }, async (directory) => {
    for (const entryPoints of [
      ["packages/opencode/src/index.ts"],
      ["./packages/opencode/src/index.ts"],
      ["packages\\opencode\\src\\index.ts"],
      ["packages/opencode/src/index"],
      [path.join(directory, "packages", "opencode", "src", "index.ts")],
    ]) {
      const output = await runDeadCode({ cwd: directory, lang: ["typescript"], entry_points: entryPoints })
      assert.match(output, /unreachable from \d+ entry point\(s\)/, `not matched: ${JSON.stringify(entryPoints)}`)
      assert.doesNotMatch(output, /zero inbound dependencies/, `fell back: ${JSON.stringify(entryPoints)}`)
      assert.doesNotMatch(output, /tui\//, `tui flagged: ${JSON.stringify(entryPoints)}`)
    }
  })
})

test("type-only imports keep modules reachable", async () => {
  await withProject({
    "src/index.ts": 'import type { Tui } from "./tui"\nexport const start = (t: Tui) => t',
    "src/tui.ts": "export class Tui {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.doesNotMatch(output, /tui\//)
    assert.match(output, /Candidates: 0/)
  })
})

test("user entry_points merge with built-in defaults instead of replacing them", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "orphan.ts": "export class Orphan {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"], entry_points: ["main.ts"] })
    // "main" 默认入口仍然生效，只有 orphan 被判死
    assert.match(output, /unreachable from 1 entry point\(s\)/)
    assert.doesNotMatch(output, /Main/)
    assert.match(output, /orphan/)
  })
})

test("warns when no entry point matches and falls back to inbound heuristic", async () => {
  await withProject({
    "a.ts": "export class A {}",
    "b.ts": 'import { A } from "./a"\nexport class B { a = A }',
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"], entry_points: ["nope/entry.ts"] })
    assert.match(output, /No configured entry point matched/)
    assert.match(output, /zero inbound dependencies/)
    assert.match(output, /false positives/)
  })
})

test("entry_point that escapes the project root is ignored with a notice", async () => {
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "kimi-dead-outside-"))
  try {
    await withProject({
      "a.ts": "export class A {}",
    }, async (directory) => {
      const output = await runDeadCode({ cwd: directory, lang: ["typescript"], entry_points: [outside] })
      assert.match(output, /ignored for resolving outside the project/)
    })
  } finally {
    await fs.rm(outside, { recursive: true, force: true })
  }
})

test("python absolute imports are tracked as in-tree dependencies", async () => {
  await withProject({
    "main.py": "from pkg.util import Util\nprint(Util)",
    "pkg/__init__.py": "",
    "pkg/util.py": "class Util:\n    pass",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["python"] })
    assert.doesNotMatch(output, /pkg\/util/)
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
