**线程**是操作系统调度的最小单位，多线程可以实现并发执行。

**创建线程：**
```python
import threading
import time

# 方式1：传入函数
def worker(name, delay):
    print(f"{name} 开始")
    time.sleep(delay)
    print(f"{name} 完成")

t1 = threading.Thread(target=worker, args=("任务A", 2))
t2 = threading.Thread(target=worker, args=("任务B", 1))

t1.start()   # 启动线程
t2.start()

t1.join()    # 等待线程结束
t2.join()
print("全部完成")

# 方式2：继承 Thread 类
class MyThread(threading.Thread):
    def run(self):
        print(f"线程 {self.name} 运行中")

t = MyThread()
t.start()
```

**线程同步——Lock：**
```python
counter = 0
lock = threading.Lock()

def increment():
    global counter
    for _ in range(100000):
        with lock:           # 获取锁 -> 执行 -> 释放锁
            counter += 1

t1 = threading.Thread(target=increment)
t2 = threading.Thread(target=increment)
t1.start(); t2.start()
t1.join(); t2.join()
print(counter)  # 200000（没有 lock 结果不确定）
```

**守护线程：**
```python
t = threading.Thread(target=worker, daemon=True)
t.start()
# 主线程结束时，守护线程会被强制终止
```

**线程池（推荐）：**
```python
from concurrent.futures import ThreadPoolExecutor

def download(url):
    # 模拟下载
    import time; time.sleep(1)
    return f"下载完成: {url}"

with ThreadPoolExecutor(max_workers=5) as executor:
    urls = ["url1", "url2", "url3"]
    futures = [executor.submit(download, url) for url in urls]
    
    for future in futures:
        print(future.result())
    
    # 或使用 map
    results = executor.map(download, urls)
    for r in results:
        print(r)
```