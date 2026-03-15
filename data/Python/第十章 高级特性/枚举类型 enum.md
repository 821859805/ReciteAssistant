**Enum（Python 3.4+）** 用于定义一组命名常量。

**基本枚举：**
```python
from enum import Enum, auto

class Color(Enum):
    RED = 1
    GREEN = 2
    BLUE = 3

# 使用
c = Color.RED
print(c)         # Color.RED
print(c.name)    # 'RED'
print(c.value)   # 1
print(repr(c))   # <Color.RED: 1>

# 通过值或名字访问
Color(1)          # Color.RED
Color['RED']      # Color.RED

# 遍历
for color in Color:
    print(color.name, color.value)

# 比较
Color.RED == Color.RED    # True
Color.RED is Color.RED    # True（单例）
Color.RED == 1            # False（不等于整数！）
```

**auto() 自动赋值：**
```python
class Direction(Enum):
    NORTH = auto()   # 1
    SOUTH = auto()   # 2
    EAST = auto()    # 3
    WEST = auto()    # 4
```

**IntEnum（可以和整数比较）：**
```python
from enum import IntEnum

class Status(IntEnum):
    OK = 200
    NOT_FOUND = 404
    ERROR = 500

Status.OK == 200         # True
Status.OK < Status.ERROR # True
```

**Flag 枚举（位运算）：**
```python
from enum import Flag, auto

class Permission(Flag):
    READ = auto()      # 1
    WRITE = auto()     # 2
    EXECUTE = auto()   # 4

# 组合权限
rw = Permission.READ | Permission.WRITE
print(rw)                          # Permission.READ|WRITE
Permission.READ in rw              # True
Permission.EXECUTE in rw           # False
```

**StrEnum（Python 3.11+）：**
```python
from enum import StrEnum

class Season(StrEnum):
    SPRING = "spring"
    SUMMER = "summer"

Season.SPRING == "spring"  # True
f"当前季节: {Season.SPRING}"  # "当前季节: spring"
```