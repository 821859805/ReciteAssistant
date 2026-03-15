默认情况下，Python 对象使用 `__dict__` 存储属性，这很灵活但占用较多内存。

**__slots__ 的作用：**
```python
class PointDict:
    def __init__(self, x, y):
        self.x = x
        self.y = y

class PointSlots:
    __slots__ = ('x', 'y')  # 限制只能有 x, y 两个属性
    
    def __init__(self, x, y):
        self.x = x
        self.y = y

# 内存对比
import sys
pd = PointDict(1, 2)
ps = PointSlots(1, 2)
sys.getsizeof(pd.__dict__)  # 约 104 字节
# ps 没有 __dict__，更紧凑
```

**__slots__ 的限制：**
```python
ps = PointSlots(1, 2)
ps.x = 10       # OK
# ps.z = 30     # AttributeError! 不能添加新属性

# 没有 __dict__
# hasattr(ps, '__dict__')  # False
```

**使用建议：**
- 当需要创建大量实例时（如数百万个），使用 `__slots__` 可显著减少内存
- 继承时子类也需要定义 `__slots__`，否则会退回到 `__dict__`
- 不能使用默认值语法（需在 `__init__` 中设置）
- 不影响类属性，只限制实例属性