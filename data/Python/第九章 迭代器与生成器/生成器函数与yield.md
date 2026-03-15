**生成器**是一种特殊的迭代器，使用 `yield` 关键字定义，按需生成值（惰性求值）。

**基本生成器：**
```python
def count_up(n):
    i = 0
    while i < n:
        yield i       # 暂停并产出值
        i += 1        # 下次调用 next() 时从这里继续

gen = count_up(3)
next(gen)  # 0
next(gen)  # 1
next(gen)  # 2
next(gen)  # StopIteration

# 在 for 循环中使用
for n in count_up(5):
    print(n)  # 0 1 2 3 4
```

**yield vs return：**
- `return` 终止函数并返回值
- `yield` 暂停函数，保存状态，下次 `next()` 时继续执行
- 函数体中有 `yield` 就是生成器函数，调用它返回生成器对象

**生成器的优势——节省内存：**
```python
# 列表：一次性加载所有数据到内存
big_list = [x ** 2 for x in range(10_000_000)]  # 占用大量内存

# 生成器：按需生成，几乎不占内存
big_gen = (x ** 2 for x in range(10_000_000))    # 生成器表达式
```

**yield from（委托生成器）：**
```python
def chain(*iterables):
    for it in iterables:
        yield from it   # 等价于 for x in it: yield x

list(chain([1, 2], [3, 4], [5]))  # [1, 2, 3, 4, 5]

# 递归生成器
def flatten(nested):
    for item in nested:
        if isinstance(item, list):
            yield from flatten(item)
        else:
            yield item

list(flatten([1, [2, [3, 4]], 5]))  # [1, 2, 3, 4, 5]
```

**send() 方法——向生成器发送值：**
```python
def accumulator():
    total = 0
    while True:
        value = yield total    # yield 表达式的值是 send 传入的值
        total += value

gen = accumulator()
next(gen)          # 0（必须先调用 next 启动生成器）
gen.send(10)       # 10
gen.send(20)       # 30
gen.send(5)        # 35
```