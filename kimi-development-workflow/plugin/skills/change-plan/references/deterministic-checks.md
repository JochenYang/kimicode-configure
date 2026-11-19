# 确定性检查写法

同一类错误出现第二次时，按下面的顺序往上搬；能用上一层就不要用下一层。

## 1. 设计 / API

- 让非法状态不可表示：判别联合、branded type、构造函数校验。
- 让错误操作不存在：把危险 API 收进内部，只暴露安全入口。
- 目录结构表达边界，命名即约束。

```ts
type State =
  | { kind: "idle" }
  | { kind: "running"; startedAt: Date }
  | { kind: "failed"; error: Error };

function assertNever(x: never): never {
  throw new Error(`unhandled state: ${JSON.stringify(x)}`);
}
```

## 2. 类型

- 严格模式、`noUncheckedIndexedAccess`、exhaustive switch。
- 外部输入从 schema 推导类型，不手写 interface。

```ts
const Input = z.object({ id: z.string().uuid(), count: z.number().int().positive() });
type Input = z.infer<typeof Input>;
```

## 3. lint / 依赖图

```js
// 禁止跨层 import
"no-restricted-imports": ["error", {
  patterns: [{ group: ["**/electron-main/**"], message: "renderer 不得 import main 进程代码" }]
}]
```

```js
// 禁止某个 API
"no-restricted-syntax": ["error", {
  selector: "CallExpression[callee.name='useEffect']",
  message: "产品代码禁用 useEffect；用框架提供的订阅 API"
}]
```

```js
// 依赖图边界
module.exports = {
  forbidden: [{
    name: "no-main-from-renderer",
    severity: "error",
    from: { path: "^src/electron-renderer" },
    to: { path: "^src/electron-main" },
  }],
};
```

## 4. 测试

- 每个 bug 先写失败用例，看它按预期失败，再改代码。
- 不变量用属性测试，单点用例保护不了整类输入。

```ts
fc.assert(fc.property(fc.array(fc.integer()), (xs) => sort(xs).length === xs.length));
```

- 边界覆盖：空值、单元素、最大长度、并发、回滚、旧数据。

## 5. 运行时探针

- 用 Playwright/CDP 写可重复脚本并提交进仓库；截图只作补充。
- 迁移/回填保留 dry-run 输出与前后计数。

```ts
await page.goto(baseUrl);
await page.getByRole("button", { name: "导出" }).click();
await expect(page.getByRole("status")).toHaveText("已导出");
```

## 6. CI 门禁

- 类型、lint、测试、build、迁移检查全部裸跑，第一个失败即停。
- 新增检查必须有反证：故意破坏时它必须变红，否则不算检查。

## 选择顺序

| 错误类型 | 首选层 |
|---|---|
| 非法状态组合 | 类型 |
| 跨层依赖 | 依赖图 / lint |
| 禁用 API | lint |
| 数据格式 | schema + 测试 |
| 回归 | 失败测试 |
| UI 流程 | 运行时脚本 |
| 命名、取舍、判断 | prose |

`check-level` 取 `design` / `lint` / `test` / `prose`，写在 Phase log 证据列。

## 不要过度

- 一次性小修正不要升级为全局规则。出现第二次再升级；否则 AGENTS.md 会变成特例清单。
- 形式化验证（TLA+、Lean）与属性 UI 测试只在错误代价高、状态空间大时使用；不是默认层。
- 不要全局禁注释。拒绝的是「用注释解释一个 workaround 而不修根因」；设计意图与非显然约束仍应写。
- 新检查必须有反证：故意破坏时它要变红，否则只是装饰。
- 检查本身也要维护。经常误报的 lint 规则会被绕过，比没有更糟。
