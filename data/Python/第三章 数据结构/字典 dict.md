**字典是键值对的无序（Python 3.7+ 保持插入顺序）集合：**
```python
# 创建字典
d = {"name": "Alice", "age": 25}
d = dict(name="Alice", age=25)
d = dict([("name", "Alice"), ("age", 25)])
d = {k: v for k, v in zip(keys, values)}  # 推导式
d = dict.fromkeys(["a", "b", "c"], 0)     # {'a': 0, 'b': 0, 'c': 0}
```

**增删改查操作：**
```python
d = {"name": "Alice", "age": 25}

# 查
d["name"]               # "Alice"（键不存在会 KeyError）
d.get("name")           # "Alice"
d.get("gender", "未知")  # "未知"（键不存在返回默认值）

# 增 / 改
d["email"] = "a@b.com"  # 新增
d["age"] = 26           # 修改
d.update({"age": 27, "city": "北京"})  # 批量更新
d |= {"score": 100}     # Python 3.9+ 合并更新

# 删
del d["email"]           # 删除指定键
d.pop("age")             # 弹出并返回值
d.pop("xxx", None)       # 键不存在时返回默认值
d.popitem()              # 弹出最后插入的键值对
d.clear()                # 清空

# 其他
len(d)                   # 键值对数量
"name" in d              # 判断键是否存在
```

**遍历字典：**
```python
d = {"a": 1, "b": 2, "c": 3}

for k in d:               # 遍历键
for k in d.keys():         # 等价
for v in d.values():       # 遍历值
for k, v in d.items():     # 遍历键值对
```

**字典合并（Python 3.9+）：**
```python
d1 = {"a": 1, "b": 2}
d2 = {"b": 3, "c": 4}
d3 = d1 | d2    # {'a': 1, 'b': 3, 'c': 4}
```

**setdefault 与 defaultdict：**
```python
# setdefault：键不存在时设置默认值并返回
d = {}
d.setdefault("items", []).append("x")
# d = {'items': ['x']}

# defaultdict：自动提供默认值
from collections import defaultdict
dd = defaultdict(list)
dd["items"].append("x")  # 自动创建空列表
```