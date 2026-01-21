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
  return JSON.parse(raw);
}

function writeDb(db) {
  ensureDataFile();
  db.updatedAt = nowIso();
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

function uuid() {
  return crypto.randomUUID();
}

function getScope(db, { bankId, chapterId, sectionId }) {
  const bank = bankId ? db.banks.find((b) => b.id === bankId) : null;
  const chapter = bank && chapterId ? bank.chapters.find((c) => c.id === chapterId) : null;
  const section = chapter && sectionId ? chapter.sections.find((s) => s.id === sectionId) : null;

  return { bank, chapter, section };
}

function walkQuestions(db, scope) {
  const questions = [];
  const pushFromSection = (sec) => {
    for (const q of sec.questions || []) questions.push(q);
  };

  if (scope.section) {
    pushFromSection(scope.section);
    return questions;
  }

  if (scope.chapter) {
    for (const sec of scope.chapter.sections || []) pushFromSection(sec);
    return questions;
  }

  if (scope.bank) {
    for (const chap of scope.bank.chapters || []) {
      for (const sec of chap.sections || []) pushFromSection(sec);
    }
    return questions;
  }

  // all
  for (const b of db.banks || []) {
    for (const c of b.chapters || []) {
      for (const s of c.sections || []) pushFromSection(s);
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
      lapses: 0
    };
  }
  if (typeof q.srs.ease !== "number") q.srs.ease = 2.5;
  if (typeof q.srs.intervalDays !== "number") q.srs.intervalDays = 0;
  if (typeof q.srs.repetitions !== "number") q.srs.repetitions = 0;
  if (!q.srs.dueAt) q.srs.dueAt = nowIso();
  if (!("lastReviewedAt" in q.srs)) q.srs.lastReviewedAt = null;
  if (typeof q.srs.lapses !== "number") q.srs.lapses = 0;
}

function sm2Update(srs, quality) {
  // quality: 0..5
  const q = Math.max(0, Math.min(5, Number(quality)));
  const now = new Date();

  let { ease, intervalDays, repetitions, lapses } = srs;
  if (typeof ease !== "number") ease = 2.5;
  if (typeof intervalDays !== "number") intervalDays = 0;
  if (typeof repetitions !== "number") repetitions = 0;
  if (typeof lapses !== "number") lapses = 0;

  // Update ease factor (SM-2)
  // EF': EF + (0.1 - (5-q)*(0.08+(5-q)*0.02))
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * ease));
  }

  const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

  return {
    ease,
    intervalDays,
    repetitions,
    dueAt,
    lastReviewedAt: now.toISOString(),
    lapses
  };
}

function findQuestionById(db, questionId) {
  for (const b of db.banks || []) {
    for (const c of b.chapters || []) {
      for (const s of c.sections || []) {
        for (const q of s.questions || []) {
          if (q.id === questionId) return q;
        }
      }
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
  db.version = 1;
  db.updatedAt = nowIso();
  // ensure srs exists
  for (const q of walkQuestions(db, {})) initSrsIfMissing(q);
  writeDb(db);
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

app.post("/api/chapters", (req, res) => {
  const { bankId, name } = req.body || {};
  if (!bankId || !name) return res.status(400).json({ error: "invalid_params" });
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  const chapter = { id: uuid(), name: String(name).trim(), createdAt: nowIso(), sections: [] };
  bank.chapters.push(chapter);
  writeDb(db);
  res.json(chapter);
});

app.post("/api/sections", (req, res) => {
  const { bankId, chapterId, name } = req.body || {};
  if (!bankId || !chapterId || !name) return res.status(400).json({ error: "invalid_params" });
  const db = readDb();
  const bank = db.banks.find((b) => b.id === bankId);
  if (!bank) return res.status(404).json({ error: "bank_not_found" });
  const chapter = bank.chapters.find((c) => c.id === chapterId);
  if (!chapter) return res.status(404).json({ error: "chapter_not_found" });
  const section = { id: uuid(), name: String(name).trim(), createdAt: nowIso(), questions: [] };
  chapter.sections.push(section);
  writeDb(db);
  res.json(section);
});

app.post("/api/questions", (req, res) => {
  const { bankId, chapterId, sectionId, questions } = req.body || {};
  if (!bankId || !chapterId || !sectionId) return res.status(400).json({ error: "invalid_scope" });
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: "invalid_questions" });

  const db = readDb();
  const scope = getScope(db, { bankId, chapterId, sectionId });
  if (!scope.section) return res.status(404).json({ error: "section_not_found" });

  const inserted = [];
  for (const item of questions) {
    const title = item && item.title ? String(item.title).trim() : "";
    const content = item && item.content ? String(item.content) : "";
    if (!title) continue;
    const q = {
      id: uuid(),
      title,
      content,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    initSrsIfMissing(q);
    scope.section.questions.push(q);
    inserted.push(q);
  }

  writeDb(db);
  res.json({ ok: true, inserted: inserted.length });
});

app.get("/api/queue", (req, res) => {
  const db = readDb();
  const bankId = req.query.bankId ? String(req.query.bankId) : null;
  const chapterId = req.query.chapterId ? String(req.query.chapterId) : null;
  const sectionId = req.query.sectionId ? String(req.query.sectionId) : null;
  const mode = req.query.mode ? String(req.query.mode) : "mixed"; // due | new | mixed
  const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit))) : 30;

  const scope = getScope(db, { bankId, chapterId, sectionId });
  const all = walkQuestions(db, scope);
  const now = Date.now();

  for (const q of all) initSrsIfMissing(q);

  const due = [];
  const fresh = [];
  for (const q of all) {
    const dueAt = q.srs && q.srs.dueAt ? Date.parse(q.srs.dueAt) : now;
    const isNew = !q.srs.lastReviewedAt && q.srs.repetitions === 0;
    const isDue = dueAt <= now;
    if (isNew) fresh.push(q);
    else if (isDue) due.push(q);
  }

  // Sort due: earliest due first; new: oldest created first
  due.sort((a, b) => Date.parse(a.srs.dueAt) - Date.parse(b.srs.dueAt));
  fresh.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  let queue = [];
  if (mode === "due") queue = due;
  else if (mode === "new") queue = fresh;
  else {
    // mixed: prioritize due, interleave some new (3:1)
    let i = 0, j = 0;
    while (queue.length < limit && (i < due.length || j < fresh.length)) {
      for (let k = 0; k < 3 && queue.length < limit && i < due.length; k++) queue.push(due[i++]);
      if (queue.length < limit && j < fresh.length) queue.push(fresh[j++]);
      if (i >= due.length && j < fresh.length) while (queue.length < limit && j < fresh.length) queue.push(fresh[j++]);
      if (j >= fresh.length && i < due.length) while (queue.length < limit && i < due.length) queue.push(due[i++]);
    }
  }

  queue = queue.slice(0, limit).map((q) => ({
    id: q.id,
    title: q.title,
    content: q.content,
    srs: q.srs
  }));

  res.json({
    mode,
    limit,
    counts: { due: due.length, new: fresh.length, total: all.length },
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

  q.srs = sm2Update(q.srs, quality);
  q.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, srs: q.srs });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`ReciteAssistant running: http://localhost:${PORT}`);
  console.log(`DB file: ${DB_PATH}`);
});

