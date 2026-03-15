/* eslint-disable no-console */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5179;

const DATA_DIR = path.join(__dirname, "data");
const META_PATH = path.join(DATA_DIR, "_metadata.json");

// ============================================================
//  通用工具
// ============================================================

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

/** 清理文件/目录名中不合法的字符 */
function sanitizeName(name) {
  let s = String(name).trim();
  // Windows 不允许的字符: < > : " / \ | ? *
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  // 不允许结尾为空格或点
  s = s.replace(/[. ]+$/, "");
  // 合并连续下划线
  s = s.replace(/_+/g, "_");
  // Windows 保留名
  if (/^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i.test(s)) s = "_" + s;
  // 限制长度 200（为 .md 后缀留余量）
  if (s.length > 200) s = s.substring(0, 200);
  if (!s) s = "untitled";
  return s;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ============================================================
//  Metadata 读写（仅 ID / SRS / 时间戳，不含题目内容）
// ============================================================

function emptyMeta() {
  return { version: 2, banks: {}, chapters: {}, questions: {}, updatedAt: nowIso() };
}

function readMeta() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(META_PATH)) return emptyMeta();
  try {
    const raw = fs.readFileSync(META_PATH, "utf8");
    const m = JSON.parse(raw);
    if (!m.banks) m.banks = {};
    if (!m.chapters) m.chapters = {};
    if (!m.questions) m.questions = {};
    return m;
  } catch (e) {
    console.error("读取 _metadata.json 失败:", e.message);
    return emptyMeta();
  }
}

function writeMeta(meta) {
  ensureDir(DATA_DIR);
  meta.version = 2;
  meta.updatedAt = nowIso();
  const tmp = META_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), "utf8");
  fs.renameSync(tmp, META_PATH);
}

// ============================================================
//  路径解析
// ============================================================

function getBankDir(meta, bankId) {
  const b = (meta.banks || {})[bankId];
  if (!b) return null;
  return path.join(DATA_DIR, sanitizeName(b.name));
}

function getChapterDir(meta, chapterId) {
  const c = (meta.chapters || {})[chapterId];
  if (!c) return null;
  const bd = getBankDir(meta, c.bankId);
  if (!bd) return null;
  return path.join(bd, sanitizeName(c.name));
}

function getQuestionPath(meta, questionId) {
  const q = (meta.questions || {})[questionId];
  if (!q) return null;
  const cd = getChapterDir(meta, q.chapterId);
  if (!cd) return null;
  return path.join(cd, q.filename);
}

/** 在目录 dir 中为 title 生成不冲突的 .md 文件名 */
function uniqueFilename(dir, title) {
  const base = sanitizeName(title);
  let filename = base + ".md";
  if (!fs.existsSync(path.join(dir, filename))) return filename;
  let i = 2;
  while (fs.existsSync(path.join(dir, base + "_" + i + ".md"))) i++;
  return base + "_" + i + ".md";
}

// ============================================================
//  SRS 工具
// ============================================================

function defaultSrs() {
  return {
    ease: 2.5, intervalDays: 0, repetitions: 0,
    dueAt: nowIso(), lastReviewedAt: null,
    lapses: 0, lastQuality: null, state: 0
  };
}

function ensureSrs(srs) {
  if (!srs) return defaultSrs();
  const s = { ...srs };
  if (typeof s.ease !== "number") s.ease = 2.5;
  if (typeof s.intervalDays !== "number") s.intervalDays = 0;
  if (typeof s.repetitions !== "number") s.repetitions = 0;
  if (!s.dueAt) s.dueAt = nowIso();
  if (!("lastReviewedAt" in s)) s.lastReviewedAt = null;
  if (typeof s.lapses !== "number") s.lapses = 0;
  if (!("lastQuality" in s)) s.lastQuality = null;
  if (typeof s.state !== "number") s.state = 0;
  return s;
}

function reviewUpdateSimple(srs, { targetState } = {}) {
  const now = nowIso();
  const next = { ...(srs || {}) };
  next.lastReviewedAt = now;
  next.repetitions = Math.max(1, Number(next.repetitions || 0));
  const currentState = typeof next.state === "number" ? next.state : 0;
  if (typeof targetState === "number") {
    next.state = Math.max(0, Math.min(6, targetState));
  } else {
    next.state = Math.min(currentState + 1, 6);
  }
  next.lastQuality = next.state;
  next.dueAt = now;
  next.intervalDays = 0;
  return next;
}

// ============================================================
//  从文件系统 + metadata 构建完整 DB
// ============================================================

function readQuestionContent(meta, questionId) {
  const fp = getQuestionPath(meta, questionId);
  if (!fp) return "";
  try { return fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : ""; } catch (_) { return ""; }
}

function buildFullDb() {
  const meta = readMeta();

  // 建索引：chapterId -> [question]
  const chapQMap = {};
  for (const [qId, qm] of Object.entries(meta.questions)) {
    if (!chapQMap[qm.chapterId]) chapQMap[qm.chapterId] = [];
    chapQMap[qm.chapterId].push({
      id: qId, title: qm.title,
      content: readQuestionContent(meta, qId),
      createdAt: qm.createdAt || nowIso(),
      updatedAt: qm.updatedAt || nowIso(),
      srs: ensureSrs(qm.srs)
    });
  }

  // 建索引：bankId -> [chapter]
  const bankCMap = {};
  for (const [cId, cm] of Object.entries(meta.chapters)) {
    if (!bankCMap[cm.bankId]) bankCMap[cm.bankId] = [];
    let qs = chapQMap[cId] || [];
    // 排序：使用显式顺序或 createdAt
    if (Array.isArray(cm.questionOrder) && cm.questionOrder.length) {
      qs = applyOrder(qs, cm.questionOrder);
    } else {
      qs.sort((a, b) => cmpTime(a.createdAt, b.createdAt));
    }
    bankCMap[cm.bankId].push({
      id: cId, name: cm.name, createdAt: cm.createdAt || nowIso(), questions: qs
    });
  }

  // 组装 banks
  const banks = [];
  for (const [bId, bm] of Object.entries(meta.banks)) {
    let chapters = bankCMap[bId] || [];
    if (Array.isArray(bm.chapterOrder) && bm.chapterOrder.length) {
      chapters = applyOrder(chapters, bm.chapterOrder);
    } else {
      chapters.sort((a, b) => cmpTime(a.createdAt, b.createdAt));
    }
    banks.push({ id: bId, name: bm.name, createdAt: bm.createdAt || nowIso(), chapters });
  }

  return { version: 2, banks, updatedAt: meta.updatedAt || nowIso() };
}

/** 按 idOrder 排列数组（有 id 字段），不在列表中的追加到末尾 */
function applyOrder(arr, idOrder) {
  const map = new Map(arr.map(item => [item.id, item]));
  const ordered = [];
  for (const id of idOrder) {
    if (map.has(id)) { ordered.push(map.get(id)); map.delete(id); }
  }
  for (const item of map.values()) ordered.push(item);
  return ordered;
}

function cmpTime(a, b) {
  return (a ? Date.parse(a) : 0) - (b ? Date.parse(b) : 0);
}

// ============================================================
//  查询工具
// ============================================================

/** 收集指定范围内的题目（含 content） */
function walkQuestions(meta, { bankId, chapterId } = {}) {
  const questions = [];
  for (const [qId, qm] of Object.entries(meta.questions)) {
    const cm = meta.chapters[qm.chapterId];
    if (!cm) continue;
    if (chapterId && qm.chapterId !== chapterId) continue;
    if (bankId && cm.bankId !== bankId) continue;
    questions.push({
      id: qId, title: qm.title,
      content: readQuestionContent(meta, qId),
      createdAt: qm.createdAt, updatedAt: qm.updatedAt,
      srs: ensureSrs(qm.srs)
    });
  }
  return questions;
}

// ============================================================
//  Express 中间件
// ============================================================

app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ============================================================
//  API 端点
// ============================================================

// ---- 全库 ----

app.get("/api/db", (_req, res) => {
  res.json(buildFullDb());
});

// ---- 题库 CRUD ----

app.post("/api/banks", (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "invalid_name" });

  const meta = readMeta();
  const bankId = uuid();
  const bankName = name.trim();
  meta.banks[bankId] = { name: bankName, createdAt: nowIso() };

  // 创建目录
  const bd = path.join(DATA_DIR, sanitizeName(bankName));
  ensureDir(bd);

  writeMeta(meta);
  res.json({ id: bankId, name: bankName, createdAt: meta.banks[bankId].createdAt, chapters: [] });
});

app.put("/api/banks/:bankId", (req, res) => {
  const bankId = String(req.params.bankId);
  const { name, chapters } = req.body || {};
  const meta = readMeta();

  const bankMeta = meta.banks[bankId];
  if (!bankMeta) return res.status(404).json({ error: "bank_not_found" });

  // 重命名
  if (name && String(name).trim() !== bankMeta.name) {
    const oldDir = path.join(DATA_DIR, sanitizeName(bankMeta.name));
    const newName = String(name).trim();
    const newDir = path.join(DATA_DIR, sanitizeName(newName));
    if (oldDir !== newDir && fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    }
    bankMeta.name = newName;
  }

  // 更新章节顺序
  if (Array.isArray(chapters)) {
    const existingIds = new Set();
    for (const [cId, cm] of Object.entries(meta.chapters)) {
      if (cm.bankId === bankId) existingIds.add(cId);
    }
    const newIds = new Set(chapters.map(c => c && c.id).filter(Boolean));
    if (existingIds.size === newIds.size && [...existingIds].every(id => newIds.has(id))) {
      bankMeta.chapterOrder = chapters.map(c => c.id);
    } else {
      return res.status(400).json({ error: "invalid_chapters" });
    }
  }

  writeMeta(meta);
  // 返回完整 bank 对象
  const db = buildFullDb();
  const bank = db.banks.find(b => b.id === bankId);
  res.json(bank || { id: bankId, name: bankMeta.name });
});

app.delete("/api/banks/:bankId", (req, res) => {
  const bankId = String(req.params.bankId);
  const meta = readMeta();

  const bankMeta = meta.banks[bankId];
  if (!bankMeta) return res.status(404).json({ error: "bank_not_found" });

  // 删除目录
  const bd = path.join(DATA_DIR, sanitizeName(bankMeta.name));
  if (fs.existsSync(bd)) fs.rmSync(bd, { recursive: true, force: true });

  // 删除元数据：题目 → 章节 → 题库
  for (const [qId, qm] of Object.entries(meta.questions)) {
    const cm = meta.chapters[qm.chapterId];
    if (cm && cm.bankId === bankId) delete meta.questions[qId];
  }
  for (const [cId, cm] of Object.entries(meta.chapters)) {
    if (cm.bankId === bankId) delete meta.chapters[cId];
  }
  delete meta.banks[bankId];

  writeMeta(meta);
  res.json({ ok: true });
});

// ---- 章节 CRUD ----

app.post("/api/chapters", (req, res) => {
  const { bankId, name } = req.body || {};
  if (!bankId || !name) return res.status(400).json({ error: "invalid_params" });

  const meta = readMeta();
  const bankMeta = meta.banks[bankId];
  if (!bankMeta) return res.status(404).json({ error: "bank_not_found" });

  const chapId = uuid();
  const chapName = String(name).trim();
  meta.chapters[chapId] = { bankId, name: chapName, createdAt: nowIso() };

  // 创建目录
  const bd = path.join(DATA_DIR, sanitizeName(bankMeta.name));
  const cd = path.join(bd, sanitizeName(chapName));
  ensureDir(cd);

  writeMeta(meta);
  res.json({ id: chapId, name: chapName, createdAt: meta.chapters[chapId].createdAt, questions: [] });
});

app.put("/api/banks/:bankId/chapters/:chapterId", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const { name, questions } = req.body || {};
  const meta = readMeta();

  if (!meta.banks[bankId]) return res.status(404).json({ error: "bank_not_found" });
  const chapMeta = meta.chapters[chapterId];
  if (!chapMeta || chapMeta.bankId !== bankId) return res.status(404).json({ error: "chapter_not_found" });

  // 重命名
  if (name && String(name).trim() !== chapMeta.name) {
    const oldDir = getChapterDir(meta, chapterId);
    const newName = String(name).trim();
    chapMeta.name = newName;
    const newDir = getChapterDir(meta, chapterId);
    if (oldDir && newDir && oldDir !== newDir && fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    }
  }

  // 更新题目顺序
  if (Array.isArray(questions)) {
    const existingIds = new Set();
    for (const [qId, qm] of Object.entries(meta.questions)) {
      if (qm.chapterId === chapterId) existingIds.add(qId);
    }
    const newIds = new Set(questions.map(q => q && q.id).filter(Boolean));
    if (existingIds.size === newIds.size && [...existingIds].every(id => newIds.has(id))) {
      chapMeta.questionOrder = questions.map(q => q.id);
    } else {
      return res.status(400).json({ error: "invalid_questions" });
    }
  }

  writeMeta(meta);
  const db = buildFullDb();
  const bank = db.banks.find(b => b.id === bankId);
  const chapter = bank ? bank.chapters.find(c => c.id === chapterId) : null;
  res.json(chapter || { id: chapterId, name: chapMeta.name });
});

app.delete("/api/banks/:bankId/chapters/:chapterId", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const meta = readMeta();

  if (!meta.banks[bankId]) return res.status(404).json({ error: "bank_not_found" });
  const chapMeta = meta.chapters[chapterId];
  if (!chapMeta || chapMeta.bankId !== bankId) return res.status(404).json({ error: "chapter_not_found" });

  // 删除目录
  const cd = getChapterDir(meta, chapterId);
  if (cd && fs.existsSync(cd)) fs.rmSync(cd, { recursive: true, force: true });

  // 删除元数据
  for (const [qId, qm] of Object.entries(meta.questions)) {
    if (qm.chapterId === chapterId) delete meta.questions[qId];
  }
  delete meta.chapters[chapterId];

  writeMeta(meta);
  res.json({ ok: true });
});

// ---- 题目 CRUD ----

/** 内部：批量新增题目到指定章节 */
function addQuestions(meta, chapterId, items) {
  const chapMeta = meta.chapters[chapterId];
  if (!chapMeta) return [];

  const cd = getChapterDir(meta, chapterId);
  if (!cd) return [];
  ensureDir(cd);

  const inserted = [];
  for (const item of items) {
    const title = item && item.title ? String(item.title).trim() : "";
    const content = item && item.content ? String(item.content) : "";
    if (!title) continue;

    const qId = uuid();
    const filename = uniqueFilename(cd, title);

    // 写 .md 文件
    fs.writeFileSync(path.join(cd, filename), content, "utf8");

    meta.questions[qId] = {
      chapterId, title, filename,
      createdAt: nowIso(), updatedAt: nowIso(),
      srs: defaultSrs()
    };
    inserted.push({ id: qId, title, content, createdAt: meta.questions[qId].createdAt, updatedAt: meta.questions[qId].updatedAt, srs: meta.questions[qId].srs });
  }
  return inserted;
}

app.post("/api/questions", (req, res) => {
  const { bankId, chapterId, questions } = req.body || {};
  if (!bankId || !chapterId) return res.status(400).json({ error: "invalid_scope" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "invalid_questions" });

  const meta = readMeta();
  if (!meta.banks[bankId]) return res.status(404).json({ error: "bank_not_found" });
  if (!meta.chapters[chapterId] || meta.chapters[chapterId].bankId !== bankId) return res.status(404).json({ error: "chapter_not_found" });

  const inserted = addQuestions(meta, chapterId, questions);
  writeMeta(meta);
  res.json({ ok: true, inserted: inserted.length });
});

app.post("/api/banks/:bankId/chapters/:chapterId/questions", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const body = req.body || {};
  const items = Array.isArray(body.questions) ? body.questions : [body];

  const meta = readMeta();
  if (!meta.banks[bankId]) return res.status(404).json({ error: "bank_not_found" });
  if (!meta.chapters[chapterId] || meta.chapters[chapterId].bankId !== bankId) return res.status(404).json({ error: "chapter_not_found" });

  const inserted = addQuestions(meta, chapterId, items);
  writeMeta(meta);
  res.json({ ok: true, inserted: inserted.length });
});

app.put("/api/questions/:questionId", (req, res) => {
  const questionId = String(req.params.questionId);
  const { title, content } = req.body || {};
  if (!title) return res.status(400).json({ error: "invalid_title" });

  const meta = readMeta();
  const qm = meta.questions[questionId];
  if (!qm) return res.status(404).json({ error: "question_not_found" });

  const cd = getChapterDir(meta, qm.chapterId);
  if (!cd) return res.status(500).json({ error: "chapter_dir_missing" });

  const newTitle = String(title).trim();
  const newContent = content == null ? "" : String(content);

  // 如果标题变了，需要重命名文件
  if (newTitle !== qm.title) {
    const oldPath = path.join(cd, qm.filename);
    const newFilename = uniqueFilename(cd, newTitle);
    const newPath = path.join(cd, newFilename);

    // 写新文件
    fs.writeFileSync(newPath, newContent, "utf8");
    // 删旧文件
    if (fs.existsSync(oldPath) && oldPath !== newPath) {
      try { fs.unlinkSync(oldPath); } catch (_) { /* ignore */ }
    }

    qm.title = newTitle;
    qm.filename = newFilename;
  } else {
    // 标题没变，只更新内容
    const fp = path.join(cd, qm.filename);
    fs.writeFileSync(fp, newContent, "utf8");
  }

  qm.updatedAt = nowIso();
  qm.srs = ensureSrs(qm.srs);
  writeMeta(meta);

  const retContent = readQuestionContent(meta, questionId);
  res.json({
    id: questionId, title: qm.title, content: retContent,
    createdAt: qm.createdAt, updatedAt: qm.updatedAt, srs: qm.srs
  });
});

app.put("/api/questions/:questionId/state", (req, res) => {
  const questionId = String(req.params.questionId);
  const body = req.body || {};
  const meta = readMeta();
  const qm = meta.questions[questionId];
  if (!qm) return res.status(404).json({ error: "question_not_found" });

  qm.srs = ensureSrs(qm.srs);

  if (body.learned === false) {
    qm.srs.state = 0;
    qm.srs.lastReviewedAt = null;
    qm.srs.lastQuality = null;
    qm.srs.repetitions = 0;
  } else if (body.state != null) {
    const st = Math.max(0, Math.min(6, Number(body.state)));
    qm.srs.state = st;
    qm.srs.lastQuality = st;
    if (st > 0) {
      qm.srs.repetitions = Math.max(1, Number(qm.srs.repetitions || 0));
      if (!qm.srs.lastReviewedAt) qm.srs.lastReviewedAt = nowIso();
    }
  }

  qm.updatedAt = nowIso();
  writeMeta(meta);
  res.json({ ok: true, srs: qm.srs });
});

app.delete("/api/questions/:questionId", (req, res) => {
  const questionId = String(req.params.questionId);
  const meta = readMeta();
  const qm = meta.questions[questionId];
  if (!qm) return res.status(404).json({ error: "question_not_found" });

  // 删除 .md 文件
  const fp = getQuestionPath(meta, questionId);
  if (fp && fs.existsSync(fp)) {
    try { fs.unlinkSync(fp); } catch (_) { /* ignore */ }
  }

  delete meta.questions[questionId];
  writeMeta(meta);
  res.json({ ok: true });
});

// ---- 复习 / 学习队列 ----

app.get("/api/queue/review", (req, res) => {
  const meta = readMeta();
  const bankId = req.query.bankId ? String(req.query.bankId) : null;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : null;
  const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit))) : 30;

  const all = walkQuestions(meta, { bankId, chapterId });

  const reviewable = [];
  const unlearnedCount = all.reduce((acc, q) => acc + ((q.srs.state || 0) < 2 ? 1 : 0), 0);

  for (const q of all) {
    if ((q.srs.state || 0) >= 2) reviewable.push(q);
  }

  reviewable.sort((a, b) => {
    const sa = a.srs.state || 0, sb = b.srs.state || 0;
    if (sa !== sb) return sa - sb;
    const ta = a.srs.lastReviewedAt ? Date.parse(a.srs.lastReviewedAt) : 0;
    const tb = b.srs.lastReviewedAt ? Date.parse(b.srs.lastReviewedAt) : 0;
    return ta - tb;
  });

  const queue = reviewable.slice(0, limit).map(q => ({
    id: q.id, title: q.title, content: q.content, srs: q.srs
  }));

  res.json({
    limit,
    counts: { learned: reviewable.length, unlearned: unlearnedCount, total: all.length },
    queue
  });
});

app.get("/api/queue/learn", (req, res) => {
  const meta = readMeta();
  const bankId = req.query.bankId ? String(req.query.bankId) : null;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : null;

  let selectedStates;
  if (req.query.states != null && String(req.query.states).trim() !== "") {
    selectedStates = new Set(
      String(req.query.states).split(",").map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 6)
    );
  } else {
    const includeNew = req.query.includeNew == null ? true : String(req.query.includeNew) !== "0";
    const includeForgot = req.query.includeForgot == null ? true : String(req.query.includeForgot) !== "0";
    selectedStates = new Set();
    if (includeNew) selectedStates.add(0);
    if (includeForgot) selectedStates.add(1);
  }

  const all = walkQuestions(meta, { bankId, chapterId });

  const matched = [];
  const stateCounts = {};
  for (let i = 0; i <= 6; i++) stateCounts[i] = 0;

  for (const q of all) {
    const st = q.srs.state || 0;
    if (st >= 0 && st <= 6) stateCounts[st]++;
    if (selectedStates.has(st)) matched.push(q);
  }

  matched.sort((a, b) => {
    const sa = a.srs.state || 0, sb = b.srs.state || 0;
    if (sa !== sb) return sa - sb;
    return cmpTime(a.createdAt, b.createdAt);
  });

  const queue = matched.map(q => ({
    id: q.id, title: q.title, content: q.content,
    state: q.srs.state || 0, srs: q.srs
  }));

  res.json({
    counts: { matched: matched.length, total: all.length, byState: stateCounts },
    queue
  });
});

app.post("/api/review", (req, res) => {
  const { questionId, state: targetState } = req.body || {};
  if (!questionId) return res.status(400).json({ error: "invalid_questionId" });

  const meta = readMeta();
  const qm = meta.questions[String(questionId)];
  if (!qm) return res.status(404).json({ error: "question_not_found" });

  qm.srs = ensureSrs(qm.srs);
  const opts = {};
  if (targetState != null && Number.isFinite(Number(targetState))) {
    opts.targetState = Number(targetState);
  }
  qm.srs = reviewUpdateSimple(qm.srs, opts);
  qm.updatedAt = nowIso();

  writeMeta(meta);
  res.json({ ok: true, srs: qm.srs });
});

// ============================================================
//  Python 代码执行
// ============================================================

// ---- 多语言代码运行 ----

// 独立工作空间目录：代码中的文件操作都在此目录下
const WORKSPACE_DIR = path.join(DATA_DIR, "workspace");
const TMP_DIR = path.join(DATA_DIR, "tmp");

const LANG_CONFIGS = {
  python: {
    ext: ".py",
    cmd: () => process.platform === "win32" ? "python" : "python3",
    args: (f) => [f],
    env: { PYTHONIOENCODING: "utf-8" }
  },
  javascript: {
    ext: ".js",
    cmd: () => "node",
    args: (f) => [f],
    env: {}
  },
  typescript: {
    ext: ".ts",
    cmd: () => "npx",
    args: (f) => ["--yes", "tsx", f],
    env: {}
  },
  go: {
    ext: ".go",
    cmd: () => "go",
    args: (f) => ["run", f],
    env: {}
  },
  java: {
    ext: ".java",
    cmd: () => "java",
    args: (f) => [f],
    env: {}
  },
  c: {
    ext: ".c",
    cmd: () => "gcc",
    compile: true,
    compileArgs: (f, out) => [f, "-o", out],
    runCmd: (out) => out,
    runArgs: () => [],
    env: {}
  },
  cpp: {
    ext: ".cpp",
    cmd: () => "g++",
    compile: true,
    compileArgs: (f, out) => [f, "-o", out, "-std=c++17"],
    runCmd: (out) => out,
    runArgs: () => [],
    env: {}
  },
  rust: {
    ext: ".rs",
    cmd: () => "rustc",
    compile: true,
    compileArgs: (f, out) => [f, "-o", out],
    runCmd: (out) => out,
    runArgs: () => [],
    env: {}
  },
  bash: {
    ext: ".sh",
    cmd: () => process.platform === "win32" ? "bash" : "/bin/bash",
    args: (f) => [f],
    env: {}
  },
  powershell: {
    ext: ".ps1",
    cmd: () => "powershell",
    args: (f) => ["-ExecutionPolicy", "Bypass", "-File", f],
    env: {}
  }
};

function runCodeFile(langCfg, tmpFile, stdin, res) {
  const startTime = Date.now();
  const TIMEOUT_MS = 15000;

  const child = execFile(
    langCfg.cmd(), langCfg.args(tmpFile),
    {
      cwd: WORKSPACE_DIR,
      timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024,
      env: { ...process.env, ...langCfg.env },
      windowsHide: true
    },
    (err, stdout, stderr) => {
      const executionTime = Date.now() - startTime;
      try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }

      if (err) {
        if (err.killed || err.signal === "SIGTERM") {
          return res.json({ stdout: stdout || "", stderr: `执行超时（超过 ${TIMEOUT_MS / 1000} 秒）`, exitCode: -1, executionTime });
        }
        return res.json({ stdout: stdout || "", stderr: stderr || err.message || "未知错误", exitCode: err.code || 1, executionTime });
      }
      res.json({ stdout: stdout || "", stderr: stderr || "", exitCode: 0, executionTime });
    }
  );

  if (stdin && typeof stdin === "string") child.stdin.write(stdin);
  child.stdin.end();
}

function compileAndRun(langCfg, tmpFile, stdin, res) {
  const startTime = Date.now();
  const TIMEOUT_MS = 15000;
  const outFile = tmpFile.replace(langCfg.ext, "") + (process.platform === "win32" ? ".exe" : "");

  execFile(
    langCfg.cmd(), langCfg.compileArgs(tmpFile, outFile),
    { cwd: WORKSPACE_DIR, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
    (compileErr, _compileOut, compileStderr) => {
      if (compileErr) {
        const executionTime = Date.now() - startTime;
        try { fs.unlinkSync(tmpFile); } catch (_) { /* */ }
        return res.json({ stdout: "", stderr: compileStderr || compileErr.message || "编译失败", exitCode: compileErr.code || 1, executionTime });
      }

      // 编译成功，运行
      const child = execFile(
        langCfg.runCmd(outFile), langCfg.runArgs(),
        {
          cwd: WORKSPACE_DIR,
          timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024,
          env: { ...process.env, ...langCfg.env },
          windowsHide: true
        },
        (err, stdout, stderr) => {
          const executionTime = Date.now() - startTime;
          try { fs.unlinkSync(tmpFile); } catch (_) { /* */ }
          try { fs.unlinkSync(outFile); } catch (_) { /* */ }

          if (err) {
            if (err.killed || err.signal === "SIGTERM") {
              return res.json({ stdout: stdout || "", stderr: `执行超时（超过 ${TIMEOUT_MS / 1000} 秒）`, exitCode: -1, executionTime });
            }
            return res.json({ stdout: stdout || "", stderr: stderr || err.message || "未知错误", exitCode: err.code || 1, executionTime });
          }
          res.json({ stdout: stdout || "", stderr: stderr || "", exitCode: 0, executionTime });
        }
      );

      if (stdin && typeof stdin === "string") child.stdin.write(stdin);
      child.stdin.end();
    }
  );
}

// 兼容旧接口
app.post("/api/python/run", (req, res) => {
  const { code, stdin } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "请提供代码" });
  }
  req.body.language = "python";
  handleCodeRun(req, res);
});

// 通用代码运行接口
app.post("/api/code/run", (req, res) => {
  handleCodeRun(req, res);
});

function handleCodeRun(req, res) {
  const { code, stdin, language } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "请提供代码" });
  }

  const lang = (language || "python").toLowerCase();
  const langCfg = LANG_CONFIGS[lang];
  if (!langCfg) {
    return res.status(400).json({ error: `不支持的语言: ${lang}` });
  }

  // 确保工作空间和临时目录存在
  ensureDir(WORKSPACE_DIR);
  ensureDir(TMP_DIR);

  const tmpFile = path.join(TMP_DIR, `code_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${langCfg.ext}`);
  fs.writeFileSync(tmpFile, code, "utf8");

  if (langCfg.compile) {
    compileAndRun(langCfg, tmpFile, stdin, res);
  } else {
    runCodeFile(langCfg, tmpFile, stdin, res);
  }
}

// 查询工作空间路径
app.get("/api/workspace", (_req, res) => {
  ensureDir(WORKSPACE_DIR);
  res.json({ path: WORKSPACE_DIR });
})

// ============================================================
//  静态资源
// ============================================================

app.use("/vendor/hljs", express.static(path.join(__dirname, "node_modules", "highlight.js", "es")));
app.use("/vendor/lib", express.static(path.join(__dirname, "node_modules", "highlight.js", "lib")));
app.use("/vendor/hljs-styles", express.static(path.join(__dirname, "node_modules", "highlight.js", "styles")));

// Monaco Editor 本地静态资源
app.use("/vs", express.static(path.join(__dirname, "node_modules", "monaco-editor", "min", "vs")));

app.use(express.static(path.join(__dirname, "public")));

// ============================================================
//  启动
// ============================================================

app.listen(PORT, () => {
  ensureDir(DATA_DIR);
  console.log(`ReciteAssistant running: http://localhost:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`存储结构: data/题库/章节/题目.md + _metadata.json`);
});
