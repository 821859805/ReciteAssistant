/* eslint-disable no-console */
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5179;

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "recite-db.json");

function nowIso() {
  return new Date().toISOString();
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const emptyDb = { version: 1, banks: [], updatedAt: nowIso() };
    fs.writeFileSync(DB_PATH, JSON.stringify(emptyDb, null, 2), "utf8");
  }
}

function readDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const db = JSON.parse(raw);
  const normalized = normalizeDb(db);
  // 如果发生结构迁移，落盘一次，保证后续直接使用新结构
  if (normalized.__changed) {
    delete normalized.__changed;
    writeDb(normalized);
  }
  return normalized;
}

function writeDb(db) {
  ensureDataFile();
  db.updatedAt = nowIso();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

function normalizeDb(db) {
  // 目标结构：bank -> chapters -> questions
  // 兼容旧结构：chapter.sections[].questions[]，迁移后写回 chapter.questions[]
  if (!db || typeof db !== "object") return { version: 1, banks: [], updatedAt: nowIso() };
  if (!Array.isArray(db.banks)) db.banks = [];
  let changed = false;

  for (const b of db.banks) {
    if (!b || typeof b !== "object") continue;
    if (!Array.isArray(b.chapters)) b.chapters = [];
    for (const c of b.chapters) {
      if (!c || typeof c !== "object") continue;
      if (!Array.isArray(c.questions)) c.questions = [];

      // 迁移旧 sections
      if (Array.isArray(c.sections) && c.sections.length) {
        const totalSections = c.sections.length;
        for (const s of c.sections) {
          if (!s || typeof s !== "object") continue;
          const secName = s.name ? String(s.name).trim() : "";
          for (const q of s.questions || []) {
            if (!q || typeof q !== "object") continue;
            // 保留来源：如果有多个小节，给标题加前缀
            if (secName && totalSections > 1 && q.title && !String(q.title).startsWith(`[${secName}]`)) {
              q.title = `[${secName}] ${String(q.title)}`;
            }
            initSrsIfMissing(q);
            c.questions.push(q);
          }
        }
        delete c.sections;
        changed = true;
      }

      // 去重（避免重复迁移）
      const seen = new Set();
      const uniq = [];
      for (const q of c.questions) {
        if (!q || !q.id) continue;
        if (seen.has(q.id)) {
          changed = true;
          continue;
        }
        seen.add(q.id);
        initSrsIfMissing(q);
        uniq.push(q);
      }
      if (uniq.length !== c.questions.length) c.questions = uniq;
    }
  }

  if (changed) db.__changed = true;
  return db;
}

function uuid() {
  return crypto.randomUUID();
}

function getScope(db, { bankId, chapterId, sectionId }) {
  const bank = bankId ? db.banks.find((b) => b.id === bankId) : null;
  const chapter = bank && chapterId ? bank.chapters.find((c) => c.id === chapterId) : null;
  // sectionId 已废弃（降层级到章节）
  return { bank, chapter, section: null };
}

function walkQuestions(db, scope) {
  const questions = [];
  const pushFromChapter = (chap) => {
    for (const q of chap.questions || []) questions.push(q);
  };

  if (scope.chapter) {
    pushFromChapter(scope.chapter);
    return questions;
  }

  if (scope.bank) {
    for (const chap of scope.bank.chapters || []) pushFromChapter(chap);
    return questions;
  }

  // all
  for (const b of db.banks || []) {
    for (const c of b.chapters || []) {
      pushFromChapter(c);
    }
  }
  return questions;
}

function initSrsIfMissing(q) {
  if (!q.srs) {
    q.srs = {
      ease: 2.5,
      intervalDays: 0,
      repetitions: 0,
      dueAt: nowIso(),
      lastReviewedAt: null,
      lapses: 0,
      lastQuality: null
    };
  }
  if (typeof q.srs.ease !== "number") q.srs.ease = 2.5;
  if (typeof q.srs.intervalDays !== "number") q.srs.intervalDays = 0;
  if (typeof q.srs.repetitions !== "number") q.srs.repetitions = 0;
  if (!q.srs.dueAt) q.srs.dueAt = nowIso();
  if (!("lastReviewedAt" in q.srs)) q.srs.lastReviewedAt = null;
  if (typeof q.srs.lapses !== "number") q.srs.lapses = 0;
  if (!("lastQuality" in q.srs)) q.srs.lastQuality = null;
}

function reviewUpdateSimple(srs, quality) {
  // 本项目复习不使用“到期”概念：只记录用户自评与上次复习时间，用作优先级
  const q = Math.max(0, Math.min(5, Number(quality)));
  const now = nowIso();
  const next = { ...(srs || {}) };
  next.lastReviewedAt = now;
  next.lastQuality = q;
  // 标记为“已学习过”
  next.repetitions = Math.max(1, Number(next.repetitions || 0));
  // 兼容字段保留但不用于调度
  next.dueAt = now;
  next.intervalDays = 0;
  return next;
}

function findQuestionById(db, questionId) {
  for (const b of db.banks || []) {
    for (const c of b.chapters || []) {
      for (const q of c.questions || []) if (q.id === questionId) return q;
    }
  }
  return null;
}

function findQuestionContext(db, questionId) {
  for (const b of db.banks || []) {
    for (const c of b.chapters || []) {
      const idx = (c.questions || []).findIndex((q) => q.id === questionId);
      if (idx >= 0) return { bank: b, chapter: c, index: idx, question: c.questions[idx] };
    }
  }
  return null;
}

app.use(express.json({ limit: "10mb" }));

// Basic CORS for local dev
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/db", (req, res) => {
  const db = readDb();
  res.json(db);
});

app.get("/api/export", (req, res) => {
  const db = readDb();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="recite-db.json"');
  res.send(JSON.stringify(db, null, 2));
});

app.post("/api/import", (req, res) => {
  const body = req.body;
  const db = body && body.version && body.banks ? body : body && body.db ? body.db : null;
  if (!db || !Array.isArray(db.banks)) return res.status(400).json({ error: "invalid_db" });
  const normalized = normalizeDb(db);
  normalized.version = 1;
  normalized.updatedAt = nowIso();
  // ensure srs exists
  for (const q of walkQuestions(normalized, {})) initSrsIfMissing(q);
  writeDb(normalized);
  res.json({ ok: true });
});

app.post("/api/banks", (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string") return res.status(400).json({ error: "invalid_name" });
  const db = readDb();
  const bank = { id: uuid(), name: name.trim(), createdAt: nowIso(), chapters: [] };
  db.banks.push(bank);
  writeDb(db);
  res.json(bank);
});

app.put("/api/banks/:bankId", (req, res) => {
  const bankId = String(req.params.bankId);
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "invalid_name" });
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  bank.name = String(name).trim();
  writeDb(db);
  res.json(bank);
});

app.delete("/api/banks/:bankId", (req, res) => {
  const bankId = String(req.params.bankId);
  const db = readDb();
  const idx = db.banks.findIndex((b) => b.id === bankId);
  if (idx < 0) return res.status(404).json({ error: "bank_not_found" });
  db.banks.splice(idx, 1);
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/chapters", (req, res) => {
  const { bankId, name } = req.body || {};
  if (!bankId || !name) return res.status(400).json({ error: "invalid_params" });
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  const chapter = { id: uuid(), name: String(name).trim(), createdAt: nowIso(), questions: [] };
  bank.chapters.push(chapter);
  writeDb(db);
  res.json(chapter);
});

app.put("/api/banks/:bankId/chapters/:chapterId", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: "invalid_name" });
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  const chapter = bank.chapters.find((c) => c.id === chapterId);
  if (!chapter) return res.status(404).json({ error: "chapter_not_found" });
  chapter.name = String(name).trim();
  writeDb(db);
  res.json(chapter);
});

app.delete("/api/banks/:bankId/chapters/:chapterId", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  const idx = bank.chapters.findIndex((c) => c.id === chapterId);
  if (idx < 0) return res.status(404).json({ error: "chapter_not_found" });
  bank.chapters.splice(idx, 1);
  writeDb(db);
  res.json({ ok: true });
});

// sections 已废弃（保留一个返回 410 的占位接口，避免旧页面误调用时静默失败）
app.post("/api/sections", (req, res) => {
  res.status(410).json({ error: "sections_deprecated" });
});

app.put("/api/banks/:bankId/chapters/:chapterId/sections/:sectionId", (req, res) => {
  res.status(410).json({ error: "sections_deprecated" });
});

app.delete("/api/banks/:bankId/chapters/:chapterId/sections/:sectionId", (req, res) => {
  res.status(410).json({ error: "sections_deprecated" });
});

app.post("/api/questions", (req, res) => {
  // 兼容旧客户端：如果带 sectionId，直接忽略并改为写入 chapter.questions
  const { bankId, chapterId, questions } = req.body || {};
  if (!bankId || !chapterId) return res.status(400).json({ error: "invalid_scope" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "invalid_questions" });

  const db = readDb();
  const scope = getScope(db, { bankId, chapterId });
  if (!scope.chapter) return res.status(404).json({ error: "chapter_not_found" });

  const inserted = [];
  for (const item of questions) {
    const title = item && item.title ? String(item.title).trim() : "";
    const content = item && item.content ? String(item.content) : "";
    if (!title) continue;
    const q = { id: uuid(), title, content, createdAt: nowIso(), updatedAt: nowIso() };
    initSrsIfMissing(q);
    scope.chapter.questions.push(q);
    inserted.push(q);
  }

  writeDb(db);
  res.json({ ok: true, inserted: inserted.length });
});

app.post("/api/banks/:bankId/chapters/:chapterId/questions", (req, res) => {
  const bankId = String(req.params.bankId);
  const chapterId = String(req.params.chapterId);
  const body = req.body || {};
  const items = Array.isArray(body.questions) ? body.questions : [body];
  const db = readDb();
  const scope = getScope(db, { bankId, chapterId });
  if (!scope.chapter) return res.status(404).json({ error: "chapter_not_found" });

  const inserted = [];
  for (const item of items) {
    const title = item && item.title ? String(item.title).trim() : "";
    const content = item && item.content ? String(item.content) : "";
    if (!title) continue;
    const q = { id: uuid(), title, content, createdAt: nowIso(), updatedAt: nowIso() };
    initSrsIfMissing(q);
    scope.chapter.questions.push(q);
    inserted.push(q);
  }
  writeDb(db);
  res.json({ ok: true, inserted: inserted.length });
});

// 旧路径兼容：仍然接受，但提示废弃并写入章节
app.post("/api/banks/:bankId/chapters/:chapterId/sections/:sectionId/questions", (req, res) => {
  res.status(410).json({ error: "sections_deprecated_use_chapter_questions" });
});

app.put("/api/questions/:questionId", (req, res) => {
  const questionId = String(req.params.questionId);
  const { title, content } = req.body || {};
  if (!title) return res.status(400).json({ error: "invalid_title" });
  const db = readDb();
  const ctx = findQuestionContext(db, questionId);
  if (!ctx) return res.status(404).json({ error: "question_not_found" });
  ctx.question.title = String(title).trim();
  ctx.question.content = content == null ? "" : String(content);
  ctx.question.updatedAt = nowIso();
  initSrsIfMissing(ctx.question);
  writeDb(db);
  res.json(ctx.question);
});

app.put("/api/questions/:questionId/state", (req, res) => {
  const questionId = String(req.params.questionId);
  const { learned, lastQuality, lastReviewedAt } = req.body || {};
  const db = readDb();
  const ctx = findQuestionContext(db, questionId);
  if (!ctx) return res.status(404).json({ error: "question_not_found" });
  initSrsIfMissing(ctx.question);

  if (learned === false) {
    ctx.question.srs.lastReviewedAt = null;
    ctx.question.srs.lastQuality = null;
    ctx.question.srs.repetitions = 0;
  } else if (learned === true) {
    ctx.question.srs.lastReviewedAt = lastReviewedAt ? String(lastReviewedAt) : ctx.question.srs.lastReviewedAt || nowIso();
    if (lastQuality == null) {
      if (ctx.question.srs.lastQuality == null) ctx.question.srs.lastQuality = 3;
    } else {
      ctx.question.srs.lastQuality = Math.max(0, Math.min(5, Number(lastQuality)));
    }
    ctx.question.srs.repetitions = Math.max(1, Number(ctx.question.srs.repetitions || 0));
  } else {
    // allow updating fields without toggling learned flag
    if (lastReviewedAt === null) ctx.question.srs.lastReviewedAt = null;
    else if (typeof lastReviewedAt === "string") ctx.question.srs.lastReviewedAt = lastReviewedAt;
    if (lastQuality === null) ctx.question.srs.lastQuality = null;
    else if (lastQuality != null) ctx.question.srs.lastQuality = Math.max(0, Math.min(5, Number(lastQuality)));
  }

  ctx.question.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, srs: ctx.question.srs });
});

app.delete("/api/questions/:questionId", (req, res) => {
  const questionId = String(req.params.questionId);
  const db = readDb();
  const ctx = findQuestionContext(db, questionId);
  if (!ctx) return res.status(404).json({ error: "question_not_found" });
  if (!ctx.chapter || !Array.isArray(ctx.chapter.questions)) return res.status(500).json({ error: "chapter_questions_missing" });
  ctx.chapter.questions.splice(ctx.index, 1);
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/queue/review", (req, res) => {
  const db = readDb();
  const bankId = req.query.bankId ? String(req.query.bankId) : null;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : null;
  const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit))) : 30;

  const scope = getScope(db, { bankId, chapterId });
  const all = walkQuestions(db, scope);

  for (const q of all) initSrsIfMissing(q);

  const learned = [];
  const unlearnedCount = all.reduce((acc, q) => acc + (!q.srs.lastReviewedAt ? 1 : 0), 0);
  for (const q of all) {
    if (q.srs.lastReviewedAt) learned.push(q);
  }

  learned.sort((a, b) => {
    const qa = a.srs.lastQuality == null ? 999 : Number(a.srs.lastQuality);
    const qb = b.srs.lastQuality == null ? 999 : Number(b.srs.lastQuality);
    if (qa !== qb) return qa - qb; // 低分优先
    const ta = a.srs.lastReviewedAt ? Date.parse(a.srs.lastReviewedAt) : 0;
    const tb = b.srs.lastReviewedAt ? Date.parse(b.srs.lastReviewedAt) : 0;
    return ta - tb; // 更久未复习优先
  });

  const queue = learned.slice(0, limit).map((q) => ({
    id: q.id,
    title: q.title,
    content: q.content,
    srs: q.srs
  }));

  res.json({
    limit,
    counts: { learned: learned.length, unlearned: unlearnedCount, total: all.length },
    queue
  });
});

app.get("/api/queue/learn", (req, res) => {
  const db = readDb();
  const bankId = req.query.bankId ? String(req.query.bankId) : null;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : null;
  const limit = req.query.limit ? Math.max(1, Math.min(500, Number(req.query.limit))) : 50;
  const includeNew = req.query.includeNew == null ? true : String(req.query.includeNew) !== "0";
  const includeForgot = req.query.includeForgot == null ? true : String(req.query.includeForgot) !== "0";

  const scope = getScope(db, { bankId, chapterId });
  const all = walkQuestions(db, scope);
  for (const q of all) initSrsIfMissing(q);

  const fresh = [];
  const forgot = [];
  for (const q of all) {
    const isNew = !q.srs.lastReviewedAt;
    const isForgot = !!q.srs.lastReviewedAt && q.srs.lastQuality != null && Number(q.srs.lastQuality) <= 2;
    if (includeNew && isNew) fresh.push(q);
    if (includeForgot && isForgot) forgot.push(q);
  }

  fresh.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  forgot.sort((a, b) => {
    const qa = a.srs.lastQuality == null ? 999 : Number(a.srs.lastQuality);
    const qb = b.srs.lastQuality == null ? 999 : Number(b.srs.lastQuality);
    if (qa !== qb) return qa - qb;
    return Date.parse(a.srs.lastReviewedAt) - Date.parse(b.srs.lastReviewedAt);
  });

  const queue = [...forgot.map((q) => ({ q, kind: "forgot" })), ...fresh.map((q) => ({ q, kind: "new" }))]
    .slice(0, limit)
    .map(({ q, kind }) => ({
      id: q.id,
      title: q.title,
      content: q.content,
      kind,
      srs: q.srs
    }));

  res.json({
    limit,
    counts: { new: fresh.length, forgot: forgot.length, total: all.length },
    queue
  });
});

app.post("/api/review", (req, res) => {
  const { questionId, quality } = req.body || {};
  if (!questionId) return res.status(400).json({ error: "invalid_questionId" });

  const db = readDb();
  const q = findQuestionById(db, String(questionId));
  if (!q) return res.status(404).json({ error: "question_not_found" });
  initSrsIfMissing(q);

  q.srs = reviewUpdateSimple(q.srs, quality);
  q.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, srs: q.srs });
});

// Vendor assets (syntax highlight)
app.use("/vendor/hljs", express.static(path.join(__dirname, "node_modules", "highlight.js", "es")));
app.use("/vendor/hljs-styles", express.static(path.join(__dirname, "node_modules", "highlight.js", "styles")));

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`ReciteAssistant running: http://localhost:${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
});

