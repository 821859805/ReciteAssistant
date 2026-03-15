**lambda 表达式：**
创建小型匿名函数，只能包含单个表达式，结果自动返回。

```python
# 语法：lambda 参数: 表达式
square = lambda x: x ** 2
square(5)  # 25

add = lambda x, y: x + y
add(3, 4)  # 7

# 等价于
def square(x):
    return x ** 2
```

**常见应用场景：**
```python
# 1. 排序的 key 参数
students = [("Alice", 85), ("Bob", 92), ("Charlie", 78)]
students.sort(key=lambda s: s[1])                  # 按成绩排序
students.sort(key=lambda s: s[1], reverse=True)    # 降序

# 2. 字典列表排序
data = [{"name": "A", "age": 30}, {"name": "B", "age": 25}]
data.sort(key=lambda x: x["age"])

# 3. filter / map 中使用
list(filter(lambda x: x > 0, [-1, 0, 1, 2]))  # [1, 2]
list(map(lambda x: x ** 2, [1, 2, 3]))         # [1, 4, 9]

# 4. 立即调用
(lambda x, y: x + y)(3, 4)  # 7
```

**lambda 的限制：**
- 只能是单个表达式，不能包含语句（如 `if/for/while`）
- 不能包含赋值操作
- 不应过度使用，复杂逻辑应使用 `def` 定义的函数
- 但可以使用条件表达式：`lambda x: "正" if x > 0 else "非正"`