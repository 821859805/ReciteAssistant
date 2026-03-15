**CSV 文件处理：**
```python
import csv

# 写入 CSV
data = [
    ["姓名", "年龄", "城市"],
    ["Alice", 25, "北京"],
    ["Bob", 30, "上海"],
]

with open("data.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerows(data)

# 读取 CSV
with open("data.csv", "r", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        print(row)  # ['姓名', '年龄', '城市']

# 使用 DictReader / DictWriter
with open("data.csv", "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(row["姓名"], row["年龄"])

with open("data.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["姓名", "年龄"])
    writer.writeheader()
    writer.writerow({"姓名": "Alice", "年龄": 25})
```

**JSON 文件处理：**
```python
import json

data = {
    "name": "Alice",
    "age": 25,
    "hobbies": ["编程", "阅读"],
    "address": {"city": "北京", "zip": "100000"}
}

# 写入 JSON 文件
with open("data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 读取 JSON 文件
with open("data.json", "r", encoding="utf-8") as f:
    loaded = json.load(f)

# 字符串转换
json_str = json.dumps(data, ensure_ascii=False)  # 对象 -> 字符串
parsed = json.loads(json_str)                     # 字符串 -> 对象
```

**JSON 类型映射：**
| Python | JSON |
|--------|------|
| dict | object |
| list, tuple | array |
| str | string |
| int, float | number |
| True / False | true / false |
| None | null |

**处理自定义类型：**
```python
from datetime import datetime

class DateEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

json.dumps({"time": datetime.now()}, cls=DateEncoder)
```