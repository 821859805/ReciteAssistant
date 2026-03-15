**创建列表：**
```python
empty = []
nums = [1, 2, 3, 4, 5]
mixed = [1, "hello", True, [1, 2]]  # 可包含不同类型
from_range = list(range(5))          # [0, 1, 2, 3, 4]
```

**增删改查操作：**
```python
lst = [1, 2, 3]

# 添加
lst.append(4)           # [1, 2, 3, 4]（尾部追加）
lst.insert(0, 0)        # [0, 1, 2, 3, 4]（指定位置插入）
lst.extend([5, 6])      # [0, 1, 2, 3, 4, 5, 6]（扩展）
lst += [7, 8]           # 等价于 extend

# 删除
lst.pop()               # 弹出末尾元素，返回该元素
lst.pop(0)              # 弹出指定索引元素
lst.remove(3)           # 删除第一个值为3的元素
del lst[0]              # 删除指定索引
lst.clear()             # 清空列表

# 修改
lst = [1, 2, 3]
lst[0] = 10             # [10, 2, 3]
lst[1:3] = [20, 30]     # [10, 20, 30]（切片赋值）

# 查找
lst.index(20)           # 返回索引
20 in lst               # True
lst.count(20)           # 出现次数
```

**排序与反转：**
```python
lst = [3, 1, 4, 1, 5]

lst.sort()              # 原地排序 [1, 1, 3, 4, 5]
lst.sort(reverse=True)  # 降序 [5, 4, 3, 1, 1]
lst.sort(key=abs)       # 按绝对值排序

sorted(lst)             # 返回新列表，不修改原列表
lst.reverse()           # 原地反转
lst[::-1]               # 返回反转后的新列表
```

**列表复制（浅拷贝与深拷贝）：**
```python
a = [1, [2, 3]]
b = a.copy()            # 浅拷贝（等价于 a[:]）
b[1].append(4)
print(a)                # [1, [2, 3, 4]] —— 嵌套对象被共享！

import copy
c = copy.deepcopy(a)    # 深拷贝，完全独立
```