**遍历序列：**
```python
# 遍历列表
for item in [1, 2, 3]:
    print(item)

# 遍历字符串
for char in "Python":
    print(char)

# 遍历字典
d = {"a": 1, "b": 2}
for key in d:           # 遍历键
    print(key)
for key, value in d.items():  # 遍历键值对
    print(key, value)
for value in d.values():      # 遍历值
    print(value)
```

**range() 函数：**
```python
range(5)          # 0, 1, 2, 3, 4
range(2, 5)       # 2, 3, 4
range(0, 10, 2)   # 0, 2, 4, 6, 8
range(5, 0, -1)   # 5, 4, 3, 2, 1

for i in range(5):
    print(i)
```

**enumerate()——带索引遍历：**
```python
fruits = ["苹果", "香蕉", "橘子"]
for index, fruit in enumerate(fruits):
    print(f"{index}: {fruit}")

# 指定起始索引
for i, fruit in enumerate(fruits, start=1):
    print(f"{i}: {fruit}")
```

**zip()——并行遍历：**
```python
names = ["Alice", "Bob"]
ages = [25, 30]
for name, age in zip(names, ages):
    print(f"{name}: {age}")

# Python 3.10+ 严格模式
for a, b in zip(names, ages, strict=True):
    pass  # 长度不等时抛出 ValueError
```

**for...else 语法：**
```python
for n in range(2, 10):
    for x in range(2, n):
        if n % x == 0:
            break
    else:
        # 循环正常结束（没有 break）时执行
        print(f"{n} 是质数")
```