**LEGB 查找顺序：**
- **L（Local）**：函数内部局部变量
- **E（Enclosing）**：外层嵌套函数的局部变量
- **G（Global）**：模块级全局变量
- **B（Built-in）**：Python 内置变量（如 `print`, `len`）

```python
x = "global"                # G

def outer():
    x = "enclosing"         # E
    
    def inner():
        x = "local"         # L
        print(x)            # "local"
    
    inner()
    print(x)                # "enclosing"

outer()
print(x)                    # "global"
```

**global 关键字：**
```python
count = 0

def increment():
    global count      # 声明使用全局变量
    count += 1

increment()
print(count)  # 1
```

**nonlocal 关键字：**
```python
def outer():
    count = 0
    
    def inner():
        nonlocal count   # 声明使用外层函数的变量
        count += 1
    
    inner()
    print(count)  # 1

outer()
```

**注意事项：**
```python
x = 10
def func():
    # print(x)   # UnboundLocalError!
    x = 20       # 赋值使 x 成为局部变量
    print(x)     # 20

# Python 会在编译时确定变量的作用域
# 如果函数内有赋值操作，该变量就是局部变量
# 要在赋值前读取同名全局变量，必须用 global 声明
```