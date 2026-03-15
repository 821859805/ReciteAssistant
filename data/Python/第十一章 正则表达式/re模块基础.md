**正则表达式**用于字符串的模式匹配和处理。

**基本使用：**
```python
import re

# match —— 从字符串开头匹配
m = re.match(r"\d+", "123abc")
if m:
    print(m.group())   # "123"

# search —— 搜索第一个匹配
m = re.search(r"\d+", "abc123def456")
if m:
    print(m.group())   # "123"

# findall —— 查找所有匹配
re.findall(r"\d+", "abc123def456")   # ['123', '456']

# finditer —— 返回迭代器
for m in re.finditer(r"\d+", "abc123def456"):
    print(m.group(), m.span())   # "123" (3,6) 等

# sub —— 替换
re.sub(r"\d+", "NUM", "abc123def456")  # "abcNUMdefNUM"

# split —— 分割
re.split(r"[,;\s]+", "a, b; c  d")    # ['a', 'b', 'c', 'd']
```

**编译正则（提高重复使用的性能）：**
```python
pattern = re.compile(r"\d+")
pattern.findall("abc123def456")   # ['123', '456']
```

**Match 对象方法：**
```python
m = re.search(r"(\w+)@(\w+)\.(\w+)", "email: alice@example.com")
m.group()    # 'alice@example.com'（完整匹配）
m.group(1)   # 'alice'（第1组）
m.group(2)   # 'example'
m.group(3)   # 'com'
m.groups()   # ('alice', 'example', 'com')
m.start()    # 7（匹配开始位置）
m.end()      # 26（匹配结束位置）
m.span()     # (7, 26)
```

**常用标志：**
```python
re.IGNORECASE  # re.I —— 忽略大小写
re.MULTILINE   # re.M —— 多行模式（^ $ 匹配每行）
re.DOTALL      # re.S —— . 匹配换行符
re.VERBOSE     # re.X —— 允许注释和空白

re.search(r"hello", "Hello World", re.I)  # 匹配
```