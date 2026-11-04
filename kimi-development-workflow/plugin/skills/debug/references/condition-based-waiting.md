# 用条件等待替代固定 sleep

固定 sleep 是偶发失败的主要来源：机器快时白等，机器慢时不够。

1. 找出测试真正等待的条件：文件出现、端口可连接、状态变为 ready、队列清空。
2. 写一个有界轮询：每 10–50ms 检查一次，总超时 1–5s，超时抛错并带上当前状态。
3. 轮询里不要吞异常；连接被拒绝这类预期错误可以继续等，其他错误立即失败。
4. 用事件或回调能替代轮询时优先用事件；没有事件再用轮询。
5. 不要用「加大 sleep」修偶发失败，那只是把概率往后推。

示例（Node）：

```js
async function waitFor(predicate, timeoutMs = 2000, intervalMs = 20) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (err) {
      last = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`condition not met in ${timeoutMs}ms${last ? `: ${last.message}` : ""}`);
}
```

注意：判定条件必须是真实条件，不是「大概准备好了」；超时时间要覆盖最慢的 CI，但不要无限等。
