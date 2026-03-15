**break——终止整个循环：**
```python
for i in range(10):
    if i == 5:
        break        # 遇到5就停止
    print(i)         # 输出 0 1 2 3 4
```

**continue——跳过本次迭代：**
```python
for i in range(10):
    if i % 2 == 0:
        continue     # 跳过偶数
    print(i)         # 输出 1 3 5 7 9
```

**pass——空操作占位符：**
```python
# 用于尚未实现的代码块
def todo_function():
    pass              # 占位，防止语法错误

class EmptyClass:
    pass

if True:
    pass              # 什么也不做

# Python 3.11+ 也可以用 ... (Ellipsis)
def todo():
    ...               # 等价于 pass，语义更明确
```

**break 在嵌套循环中只影响最内层：**
```python
for i in range(3):
    for j in range(3):
        if j == 1:
            break          # 只跳出内层循环
        print(f"i={i}, j={j}")
# 输出: i=0,j=0  i=1,j=0  i=2,j=0

# 如果要跳出多层循环，可以使用标志变量或封装成函数后 return
```