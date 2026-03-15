**asyncio** 是 Python 的异步 IO 框架，使用协程实现高效并发。

**基本概念：**
- **协程（coroutine）**：用 `async def` 定义的函数
- **await**：暂停协程，等待异步操作完成
- **事件循环**：调度和执行协程

**基本使用：**
```python
import asyncio

async def say(message, delay):
    await asyncio.sleep(delay)   # 非阻塞等待
    print(message)

async def main():
    # 并发执行多个协程
    await asyncio.gather(
        say("Hello", 2),
        say("World", 1),
    )
    # 输出: World (1秒后) -> Hello (2秒后)
    # 总耗时约2秒（并发执行）

asyncio.run(main())   # Python 3.7+
```

**创建任务（Task）：**
```python
async def main():
    # 创建任务（立即开始调度）
    task1 = asyncio.create_task(say("Hello", 2))
    task2 = asyncio.create_task(say("World", 1))
    
    # 等待任务完成
    await task1
    await task2
```

**异步迭代与上下文管理：**
```python
# 异步生成器
async def async_range(n):
    for i in range(n):
        await asyncio.sleep(0.1)
        yield i

async def main():
    async for i in async_range(5):
        print(i)

# 异步上下文管理器
class AsyncTimer:
    async def __aenter__(self):
        self.start = asyncio.get_event_loop().time()
        return self
    
    async def __aexit__(self, *args):
        elapsed = asyncio.get_event_loop().time() - self.start
        print(f"耗时: {elapsed:.2f}秒")
```

**异步 HTTP 请求示例：**
```python
import aiohttp  # 需要 pip install aiohttp

async def fetch(session, url):
    async with session.get(url) as response:
        return await response.text()

async def main():
    urls = ["https://example.com"] * 10
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, url) for url in urls]
        results = await asyncio.gather(*tasks)
    print(f"获取了 {len(results)} 个页面")

asyncio.run(main())
```

**asyncio vs 多线程：**
| 特性 | asyncio | 多线程 |
|------|---------|--------|
| 并发模型 | 协作式（单线程） | 抢占式 |
| 切换开销 | 极小 | 较大 |
| 竞态条件 | 几乎无 | 需要锁 |
| 适用场景 | 大量 IO 并发 | IO 密集 + 阻塞调用 |
| 生态 | 需要异步库 | 可用同步库 |