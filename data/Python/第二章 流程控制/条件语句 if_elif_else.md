**基本语法：**
```python
age = 18

if age < 18:
    print("未成年")
elif age == 18:
    print("刚成年")
else:
    print("成年人")
```

**条件表达式（三元运算符）：**
```python
status = "成年" if age >= 18 else "未成年"

# 嵌套（不推荐过度使用）
level = "A" if score >= 90 else "B" if score >= 80 else "C"
```

**match-case（Python 3.10+，结构化模式匹配）：**
```python
command = "quit"

match command:
    case "start":
        print("启动")
    case "stop" | "quit":    # 多个值匹配
        print("停止")
    case str(x) if x.startswith("go"):  # 守卫条件
        print(f"前往 {x[2:]}")
    case _:                  # 默认匹配（通配符）
        print("未知命令")

# 解构匹配
point = (1, 2)
match point:
    case (0, 0):
        print("原点")
    case (x, 0):
        print(f"x轴上: {x}")
    case (0, y):
        print(f"y轴上: {y}")
    case (x, y):
        print(f"点: ({x}, {y})")
```

**注意事项：**
- Python 没有 switch 语句（3.10 之前），用 if/elif 或字典映射代替
- 条件判断可以直接利用真值判断：`if my_list:`（非空列表为真）