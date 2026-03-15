**多进程**可以绕过 GIL，实现真正的并行计算。

**基本使用：**
```python
from multiprocessing import Process

def compute(name, n):
    total = sum(range(n))
    print(f"{name}: {total}")

if __name__ == "__main__":      # Windows 上必须加这个保护
    p1 = Process(target=compute, args=("进程A", 50_000_000))
    p2 = Process(target=compute, args=("进程B", 50_000_000))
    
    p1.start()
    p2.start()
    p1.join()
    p2.join()
```

**进程池：**
```python
from concurrent.futures import ProcessPoolExecutor
import math

def is_prime(n):
    if n < 2: return False
    return all(n % i != 0 for i in range(2, int(math.sqrt(n)) + 1))

if __name__ == "__main__":
    numbers = range(100000, 101000)
    
    with ProcessPoolExecutor() as executor:
        results = list(executor.map(is_prime, numbers))
    
    prime_count = sum(results)
    print(f"质数个数: {prime_count}")
```

**进程间通信：**
```python
from multiprocessing import Process, Queue, Pipe

# 1. Queue —— 安全的消息队列
def producer(q):
    for i in range(5):
        q.put(i)

def consumer(q):
    while not q.empty():
        print(q.get())

if __name__ == "__main__":
    q = Queue()
    p1 = Process(target=producer, args=(q,))
    p2 = Process(target=consumer, args=(q,))
    p1.start(); p1.join()
    p2.start(); p2.join()

# 2. Pipe —— 双向管道
def sender(conn):
    conn.send("hello")
    conn.close()

if __name__ == "__main__":
    parent_conn, child_conn = Pipe()
    p = Process(target=sender, args=(child_conn,))
    p.start()
    print(parent_conn.recv())  # "hello"
    p.join()
```

**多线程 vs 多进程：**
| 特性 | 多线程 | 多进程 |
|------|--------|--------|
| 内存 | 共享 | 独立 |
| 通信 | 直接共享变量 | 需要 Queue/Pipe 等 |
| 创建开销 | 小 | 大 |
| GIL 影响 | 受限 | 不受限 |
| 适用场景 | IO 密集型 | CPU 密集型 |