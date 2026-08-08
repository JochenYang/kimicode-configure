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

test("import-looking text in comments, strings, and templates does not create edges", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "docs.ts": [
      '// import { B } from "./b"',
      'const tip = \'import { B } from "./b"\'',
      "const tpl = `import { B } from './b'`",
      "export class Docs {}",
    ].join("\n"),
    "b.ts": "export class B {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    // b.ts 没有真实引用，必须仍被判为候选（错误实现下 docs→b 边会把它标记为可达）
    assert.match(output, /b\//)
    assert.match(output, /\[high\]/)
  })
})

test("python: import text inside docstrings is ignored", async () => {
  await withProject({
    "main.py": "print(1)",
    "doc.py": '"""\nfrom b import B\n"""\nclass Doc:\n    pass',
    "b.py": "class B:\n    pass",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["python"] })
    // docstring 里的 from-import 不得让 b.py 变为可达；两个模块都是孤立候选
    assert.match(output, /b\//)
    assert.match(output, /doc\//)
  })
})

test("exports inside namespace blocks are not top-level symbols", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "ns.ts": "export namespace N {\n  export class Inner {}\n}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    // Inner 不是模块级导出 → ns.ts 没有导出符号 → 不满足 min_exports，不应成为候选
    assert.doesNotMatch(output, /ns\//)
  })
})

test("default excludes skip generated and icon modules", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "src/gen/schema.ts": "export class GenSchema {}",
    "src/model.gen.ts": "export class GenModel {}",
    "src/icons/logo.ts": "export class Logo {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /Modules: 1/)
    assert.doesNotMatch(output, /GenSchema|GenModel|Logo/)
  })
})

test("package.json exports act as entry points", async () => {
  await withProject({
    "package.json": JSON.stringify({ name: "app", exports: { ".": "./src/index.ts" } }),
    "src/index.ts": 'export * from "./lib/helper"',
    "src/lib/helper.ts": "export class Helper {}",
    "src/orphan.ts": "export class Orphan {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /package exports: 1/)
    assert.match(output, /Public API \(package.json exports\): src\/index/)
    assert.doesNotMatch(output, /helper\//)
    assert.match(output, /orphan/)
  })
})

test("package.json main remaps dist output back to src", async () => {
  await withProject({
    "package.json": JSON.stringify({ name: "app", main: "./dist/index.js" }),
    "src/index.ts": "export class Entry {}",
    "src/other.ts": "export class Other {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.doesNotMatch(output, /src\/index\//)
    assert.match(output, /other/)
  })
})

test("structural entries: Next.js app router pages are entry points", async () => {
  await withProject({
    "src/app/page.tsx": 'import { Widget } from "../components/widget"\nexport default function Page() { return Widget() }',
    "src/components/widget.tsx": "export function Widget() { return null }",
    "src/other.ts": "export class Other {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /structural: 1/)
    assert.doesNotMatch(output, /widget\//)
    assert.match(output, /other/)
  })
})

test("structural entries: Electron main/preload/renderer layout", async () => {
  await withProject({
    "packages/desktop/src/main/index.ts": "export class Main {}",
    "packages/desktop/src/preload.ts": "export class Preload {}",
    "packages/desktop/src/renderer.ts": "export class Renderer {}",
    "packages/desktop/src/shared/ipc.ts": "export class Ipc {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /structural: 3/)
    // shared/ipc 无任何入口引用 → 仍应是候选
    assert.match(output, /shared\/ipc/)
  })
})

test("structural entries: package subdirectory indices when no root index exists", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "packages/console/app/index.ts": "export class ConsoleApp {}",
    "packages/console/core/index.ts": 'import { ConsoleApp } from "../app"\nexport class Core {}',
    "packages/console/util/format.ts": "export class Format {}",
  }, async (directory) => {
    const output = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(output, /structural: 2/)
    assert.doesNotMatch(output, /console\/core\//)
    assert.doesNotMatch(output, /console\/app\//)
    assert.match(output, /console\/util\/format/)
  })
})

test("min_confidence filters candidates by reference strength", async () => {
  await withProject({
    "main.ts": "export class Main {}",
    "a.ts": 'import { B } from "./b"\nexport class A {}',
    "b.ts": "export class B {}",
  }, async (directory) => {
    const all = await runDeadCode({ cwd: directory, lang: ["typescript"] })
    assert.match(all, /\[high\]/)
    assert.match(all, /\[medium\]/)
    assert.match(all, /High: 1 \| Medium: 1/)
    assert.match(all, /### Candidates by package/)

    const highOnly = await runDeadCode({ cwd: directory, lang: ["typescript"], min_confidence: "high" })
    assert.match(highOnly, /a\//)
    assert.doesNotMatch(highOnly, /b\//)
    assert.match(highOnly, /2 before min_confidence=high/)
  })
})
