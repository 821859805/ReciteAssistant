**dataclass（Python 3.7+）** 自动生成 `__init__`, `__repr__`, `__eq__` 等方法。

**基本用法：**
```python
from dataclasses import dataclass, field

@dataclass
class Point:
    x: float
    y: float

p = Point(3.0, 4.0)
print(p)           # Point(x=3.0, y=4.0)（自动 __repr__）
p == Point(3.0, 4.0)  # True（自动 __eq__）
```

**默认值与字段选项：**
```python
@dataclass
class Student:
    name: str
    age: int = 18                           # 默认值
    scores: list = field(default_factory=list)  # 可变默认值必须用 field
    _internal: int = field(default=0, repr=False)  # 不显示在 repr 中

s = Student("Alice")
# Student(name='Alice', age=18, scores=[])
```

**不可变 dataclass：**
```python
@dataclass(frozen=True)
class FrozenPoint:
    x: float
    y: float

p = FrozenPoint(1.0, 2.0)
# p.x = 3.0  # FrozenError! 不可变
# 可以用作字典键或放入集合（自动生成 __hash__）
```

**排序支持：**
```python
@dataclass(order=True)
class Version:
    major: int
    minor: int
    patch: int

versions = [Version(1, 2, 0), Version(1, 1, 5), Version(2, 0, 0)]
sorted(versions)
# [Version(1, 1, 5), Version(1, 2, 0), Version(2, 0, 0)]
```

**post_init 后处理：**
```python
@dataclass
class Rectangle:
    width: float
    height: float
    area: float = field(init=False)  # 不参与 __init__
    
    def __post_init__(self):
        self.area = self.width * self.height

r = Rectangle(3, 4)
print(r.area)  # 12
```

**dataclass vs namedtuple：**
| 特性 | dataclass | namedtuple |
|------|-----------|------------|
| 可变 | 默认可变 | 不可变 |
| 默认值 | 支持 | 支持 |
| 类型注解 | 原生支持 | 有限支持 |
| 继承 | 完整支持 | 有限 |
| 性能 | 普通类 | 更轻量 |