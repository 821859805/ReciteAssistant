**集合是无序、不重复元素的集合：**
```python
# 创建集合
s = {1, 2, 3}
s = set([1, 2, 2, 3])   # {1, 2, 3}（自动去重）
empty = set()            # 注意：{} 是空字典不是空集合！
```

**基本操作：**
```python
s = {1, 2, 3}

# 添加
s.add(4)                # {1, 2, 3, 4}
s.update([5, 6])        # {1, 2, 3, 4, 5, 6}

# 删除
s.remove(1)             # 删除元素（不存在抛 KeyError）
s.discard(99)           # 删除元素（不存在不报错）
s.pop()                 # 随机弹出一个元素
s.clear()               # 清空

# 成员判断（O(1) 时间复杂度）
3 in s                  # True
```

**集合运算（数学集合操作）：**
```python
a = {1, 2, 3, 4}
b = {3, 4, 5, 6}

# 并集
a | b                   # {1, 2, 3, 4, 5, 6}
a.union(b)

# 交集
a & b                   # {3, 4}
a.intersection(b)

# 差集
a - b                   # {1, 2}（在a中但不在b中）
a.difference(b)

# 对称差集
a ^ b                   # {1, 2, 5, 6}（不同时在两个集合中的）
a.symmetric_difference(b)

# 子集与超集
{1, 2} <= {1, 2, 3}    # True（子集）
{1, 2, 3} >= {1, 2}    # True（超集）
{1, 2} < {1, 2, 3}     # True（真子集）
```

**frozenset（不可变集合）：**
```python
fs = frozenset([1, 2, 3])
# fs.add(4)  # AttributeError! 不可变
# 可以用作字典的键或集合的元素
d = {fs: "value"}
```

**应用场景：**
- 去重：`list(set(items))`
- 成员检测（比列表快得多）
- 集合运算（求共同好友等）