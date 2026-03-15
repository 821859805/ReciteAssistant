**itertools** 提供了高效的迭代器工具函数。

**无限迭代器：**
```python
from itertools import count, cycle, repeat

# count(start, step) —— 无限计数
for i in count(10, 2):    # 10, 12, 14, 16, ...
    if i > 20: break

# cycle(iterable) —— 无限循环
colors = cycle(["红", "绿", "蓝"])
[next(colors) for _ in range(5)]  # ['红', '绿', '蓝', '红', '绿']

# repeat(elem, n) —— 重复
list(repeat("hello", 3))   # ['hello', 'hello', 'hello']
```

**终止迭代器：**
```python
from itertools import chain, islice, zip_longest, accumulate, groupby, takewhile, dropwhile

# chain —— 连接多个可迭代对象
list(chain([1, 2], [3, 4]))      # [1, 2, 3, 4]

# islice —— 切片迭代器
list(islice(range(100), 5, 10))  # [5, 6, 7, 8, 9]

# zip_longest —— 最长配对
list(zip_longest([1, 2], [3], fillvalue=0))
# [(1, 3), (2, 0)]

# accumulate —— 累积
list(accumulate([1, 2, 3, 4]))   # [1, 3, 6, 10]

# groupby —— 按 key 分组（需先排序）
data = sorted(["apple", "ant", "banana", "bat"])
for key, group in groupby(data, key=lambda x: x[0]):
    print(key, list(group))
# a ['ant', 'apple']
# b ['banana', 'bat']

# takewhile / dropwhile
list(takewhile(lambda x: x < 5, [1, 3, 5, 2]))  # [1, 3]
list(dropwhile(lambda x: x < 5, [1, 3, 5, 2]))  # [5, 2]
```

**排列组合：**
```python
from itertools import product, permutations, combinations, combinations_with_replacement

# 笛卡尔积
list(product("AB", "12"))
# [('A','1'), ('A','2'), ('B','1'), ('B','2')]

# 全排列
list(permutations("ABC", 2))
# [('A','B'), ('A','C'), ('B','A'), ('B','C'), ('C','A'), ('C','B')]

# 组合
list(combinations("ABCD", 2))
# [('A','B'), ('A','C'), ('A','D'), ('B','C'), ('B','D'), ('C','D')]

# 可重复组合
list(combinations_with_replacement("AB", 2))
# [('A','A'), ('A','B'), ('B','B')]
```