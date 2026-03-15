**with 语句**用于资源的自动获取和释放。

**内置支持 with 的类型：**
```python
# 文件
with open("file.txt") as f:
    data = f.read()

# 线程锁
import threading
lock = threading.Lock()
with lock:
    # 临界区代码

# 数据库连接
import sqlite3
with sqlite3.connect("db.sqlite") as conn:
    conn.execute("SELECT 1")
```

**自定义上下文管理器（类方式）：**
```python
class Timer:
    def __enter__(self):
        import time
        self.start = time.time()
        return self  # 绑定到 as 后的变量
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        self.elapsed = time.time() - self.start
        print(f"耗时: {self.elapsed:.4f}秒")
        return False  # False = 不抑制异常，True = 抑制异常

with Timer() as t:
    sum(range(10_000_000))
# 耗时: 0.2345秒
```

**使用 contextmanager 装饰器（更简洁）：**
```python
from contextlib import contextmanager

@contextmanager
def timer():
    import time
    start = time.time()
    yield                # yield 之前 = __enter__，之后 = __exit__
    elapsed = time.time() - start
    print(f"耗时: {elapsed:.4f}秒")

with timer():
    sum(range(10_000_000))

# 带返回值
@contextmanager
def managed_file(path, mode):
    f = open(path, mode)
    try:
        yield f
    finally:
        f.close()

with managed_file("test.txt", "w") as f:
    f.write("hello")
```

**suppress——忽略特定异常：**
```python
from contextlib import suppress

with suppress(FileNotFoundError):
    os.remove("nonexistent.txt")
# 等价于 try...except FileNotFoundError: pass
```