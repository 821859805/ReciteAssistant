**基本语法：**
```python
count = 0
while count < 5:
    print(count)
    count += 1
```

**无限循环：**
```python
while True:
    command = input("请输入命令 (quit退出): ")
    if command == "quit":
        break
    print(f"执行: {command}")
```

**while...else 语法：**
```python
n = 5
while n > 0:
    n -= 1
    if n == 2:
        break
else:
    # 仅当 while 条件自然变为 False 时执行
    # 如果是 break 退出则不执行
    print("循环正常结束")
```

**常见模式：**
```python
# 哨兵循环（sentinel loop）
total = 0
while True:
    value = input("输入数字（输入q退出）: ")
    if value == 'q':
        break
    total += float(value)
print(f"总和: {total}")

# 验证输入
while True:
    age = input("请输入年龄: ")
    if age.isdigit() and 0 < int(age) < 150:
        age = int(age)
        break
    print("输入无效，请重新输入")
```