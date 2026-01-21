# ReciteAssistant

一个**辅助背诵面试题**的本地软件：题库/章节/题目管理 + 学习页（**慢遗忘/间隔重复**）。

## 核心学习方案（灵活可扩展）

学习页遵循“**主动回忆 + 间隔重复（Spaced Repetition）**”：

- **遮盖-回忆-揭示**：先说/写出要点，再查看答案，避免“看懂了=会了”的错觉。
- **0-5 自评分**驱动复习间隔：分数越低越快再出现，分数越高间隔越长，实现“慢遗忘”。
- **混合模式**：优先复习到期题，穿插少量新题（默认约 3:1），兼顾“巩固”与“扩充”。

复习调度使用 SM-2 变体（Anki 常用思想）：

- 评分 \(q \in [0,5]\)，更新易度因子 EF
- \(q<3\)：视为遗忘，间隔重置为 1 天并记录一次 lapse
- \(q\ge 3\)：按 SM-2 规则递增 repetitions，并扩大 intervalDays

> 你后续也可以很容易扩展：比如“口述计时”、“关键词命中率”、“按岗位标签抽题”、“错题本/高频题优先”等。

## 本地文件数据库

所有数据存放在 `data/recite-db.json`（本地文件充当数据库）。

数据结构（简化，当前为两级目录：题库/章节/题目）：

```json
{
  "version": 1,
  "banks": [
    {
      "id": "xxx",
      "name": "Java",
      "chapters": [
        {
          "id": "yyy",
          "name": "JVM",
          "questions": [
            {
              "id": "q1",
              "title": "题目",
              "content": "内容（支持多行文本）",
              "srs": {
                "ease": 2.5,
                "intervalDays": 6,
                "repetitions": 2,
                "dueAt": "2026-01-21T00:00:00.000Z",
                "lastReviewedAt": "2026-01-20T12:00:00.000Z",
                "lapses": 0,
                "lastQuality": 4
              }
            }
          ]
        }
      ]
    }
  ]
}
```

> 兼容：如果你导入的是旧结构（含 `sections`），服务端会自动迁移为新结构并写回本地文件。

## 运行

要求：本机安装 Node.js（建议 18+）。

```bash
npm install
npm run dev
```

启动后访问：`http://localhost:5179`

## 导入题库

学习页右上角支持“导入题库(JSON)”（直接导入整个 `recite-db.json`）。

也支持“快速导入（当前小节）”：粘贴 JSON 数组：

```json
[
  { "title": "题目1", "content": "内容1" },
  { "title": "题目2", "content": "内容2" }
]
```
