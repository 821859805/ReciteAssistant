**高阶函数**是接收函数作为参数或返回函数的函数。

**map() —— 对每个元素应用函数：**
```python
nums = [1, 2, 3, 4, 5]

# 每个元素平方
list(map(lambda x: x ** 2, nums))   # [1, 4, 9, 16, 25]
# 等价推导式：[x ** 2 for x in nums]

# 多个可迭代对象
list(map(lambda x, y: x + y, [1, 2], [3, 4]))  # [4, 6]

# 使用已有函数
list(map(str, nums))    # ['1', '2', '3', '4', '5']
list(map(int, ["1", "2", "3"]))  # [1, 2, 3]
```

**filter() —— 过滤元素：**
```python
nums = range(-5, 6)

# 保留正数
list(filter(lambda x: x > 0, nums))   # [1, 2, 3, 4, 5]
# 等价推导式：[x for x in nums if x > 0]

# 过滤空值
list(filter(None, [0, "", "hello", [], [1]]))
# ['hello', [1]]  ——保留真值
```

**reduce() —— 累积计算：**
```python
from functools import reduce

nums = [1, 2, 3, 4, 5]

# 求和
reduce(lambda acc, x: acc + x, nums)         # 15
# 过程：((((1+2)+3)+4)+5)

# 求乘积
reduce(lambda acc, x: acc * x, nums)         # 120

# 指定初始值
reduce(lambda acc, x: acc + x, nums, 100)    # 115

# 求最大值
reduce(lambda a, b: a if a > b else b, nums) # 5
```

**实践建议：**
- 优先使用列表推导式代替 map/filter（更 Pythonic、更可读）
- reduce 通常可以用 sum()、math.prod() 等内置函数代替
- 但在函数式编程风格中，这些函数仍然很有用