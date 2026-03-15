**GIL（Global Interpreter Lock）** 是 CPython 解释器的一个互斥锁，确保同一时刻只有一个线程执行 Python 字节码。

**GIL 的影响：**
```python
# CPU 密集型任务 —— 多线程无法利用多核
import time, threading

def cpu_bound():
    total = 0
    for _ in range(50_000_000):
        total += 1
    return total

# 单线程
start = time.time()
cpu_bound()
cpu_bound()
print(f"单线程: {time.time() - start:.2f}秒")

# 多线程（不会更快，可能更慢！）
start = time.time()
t1 = threading.Thread(target=cpu_bound)
t2 = threading.Thread(target=cpu_bound)
t1.start(); t2.start()
t1.join(); t2.join()
print(f"多线程: {time.time() - start:.2f}秒")
```

**GIL 不影响 IO 密集型任务：**
```python
# IO 操作（网络请求、文件读写）时 GIL 会释放
# 因此多线程对 IO 密集型任务仍然有效
import requests

# 多线程下载 —— 有效加速
urls = ["https://example.com"] * 10
with ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(requests.get, urls))
```

**CPU 密集型的解决方案：**
| 方案 | 说明 |
|------|------|
| **multiprocessing** | 多进程，每个进程有独立的 GIL |
| **concurrent.futures.ProcessPoolExecutor** | 进程池 |
| **C 扩展** | 用 C/Cython 编写计算密集部分 |
| **子解释器（3.12+）** | 实验性的无 GIL 子解释器 |
| **Free-threaded Python（3.13+）** | 实验性的无 GIL 模式 |

**总结：**
- IO 密集型 → 多线程 / asyncio
- CPU 密集型 → 多进程 / C 扩展