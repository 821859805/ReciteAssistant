const $ = (id) => document.getElementById(id);

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return await res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function formatMmSs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const LS_PACE = "ra_learn_pace_v2";
const LS_QTIME = "ra_learn_qtime_v2";

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function loadPaceMultiplier() {
  const v = Number(localStorage.getItem(LS_PACE));
  // 默认给得更充裕：新题/遗忘题学习要“背会”，不是“扫一遍”
  if (!Number.isFinite(v) || v <= 0) return 1.6;
  return clamp(v, 0.9, 4.0);
}

function savePaceMultiplier(v) {
  localStorage.setItem(LS_PACE, String(clamp(v, 0.9, 4.0)));
}

function loadQuestionTimeMap() {
  const raw = localStorage.getItem(LS_QTIME);
  const obj = safeJsonParse(raw || "{}", {});
  return obj && typeof obj === "object" ? obj : {};
}

function saveQuestionTimeMap(map) {
  localStorage.setItem(LS_QTIME, JSON.stringify(map));
}

function countEffectiveChars(content) {
  const text = String(content || "");
  return text.replace(/\s+/g, "").length;
}

function countChars(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

// 基础时长（秒）：按内容长度给一个“足够背会”的初始预算（再乘以用户节奏系数）
function baseSecondsFromContent(content) {
  const chars = countEffectiveChars(content);
  // 经验值：基础 30s + 0.30s/字；并给出更大的上限
  // 200 字 ≈ 90s；500 字 ≈ 180s；1000 字 ≈ 330s
  const sec = Math.round(30 + chars * 0.3);
  return clamp(sec, 60, 900);
}

function calcSecondsForQuestion(q, paceMult, qTimeMap) {
  const base = Math.round(baseSecondsFromContent(q?.content) * paceMult);
  const rec = qTimeMap && q && q.id ? qTimeMap[q.id] : null;
  const avg = rec && typeof rec.avg === "number" ? rec.avg : null;
  // 单题有历史时，至少给到历史平均的 1.1 倍（留出检索/复述缓冲）
  const sec = avg ? Math.max(base, Math.round(avg * 1.1)) : base;
  return clamp(sec, 60, 900);
}

const state = {
  db: null,
  mode: { includeNew: true, includeForgot: true, limit: 30 },
  scope: { bankId: "", chapterId: "" },
  queue: [],
  seconds: [],
  idx: 0,
  stage: "idle", // idle | warmup | running | done
  startedAt: null,
  warmupEndsAt: null,
  qStartedAt: null,
  qAllocatedSec: null,
  paceMult: 1.6,
  qEndsAt: null,
  timer: null,
  qTimeMap: {}
};

function getScope(db, bankId, chapterId) {
  const bank = bankId ? (db.banks || []).find((b) => b.id === bankId) : null;
  const chapter = bank && chapterId ? (bank.chapters || []).find((c) => c.id === chapterId) : null;
  return { bank, chapter };
}

function scopeLabelText() {
  const bankSel = $("bankSelect");
  const chapSel = $("chapterSelect");
  const bank = bankSel && bankSel.value ? bankSel.options[bankSel.selectedIndex].text : "全部题库";
  const chap = chapSel && chapSel.value ? chapSel.options[chapSel.selectedIndex].text : "全部章节";
  return `${bank} / ${chap}`;
}

function setStats(counts) {
  const scopeLabel = scopeLabelText();
  const c = counts || { new: 0, forgot: 0, total: 0 };
  $("stats").innerHTML = `
    <div><b>范围</b>：${scopeLabel}</div>
    <div><b>遗忘题</b>：${c.forgot}，<b>新题</b>：${c.new}，<b>总题</b>：${c.total}</div>
  `;
}

function fillSelect(selectEl, items, allLabel) {
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name;
    selectEl.appendChild(opt);
  }
}

function fillChapters() {
  const bankId = $("bankSelect").value;
  const chapSel = $("chapterSelect");
  fillSelect(chapSel, [], "全部章节");
  const bank = (state.db.banks || []).find((b) => b.id === bankId);
  if (!bank) return;
  fillSelect(chapSel, bank.chapters || [], "全部章节");
}

function stopTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function setKpis(nowMs) {
  const elapsed = state.startedAt ? nowMs - state.startedAt : 0;
  const remainingCount = state.stage === "done" ? 0 : Math.max(0, state.queue.length - state.idx);

  let remainingMs = 0;
  if (state.stage === "warmup") {
    remainingMs += Math.max(0, state.warmupEndsAt - nowMs);
    const rest = state.seconds.slice(0).reduce((a, b) => a + b, 0);
    remainingMs += rest * 1000;
  } else if (state.stage === "running") {
    remainingMs += Math.max(0, state.qEndsAt - nowMs);
    const rest = state.seconds.slice(state.idx + 1).reduce((a, b) => a + b, 0);
    remainingMs += rest * 1000;
  }

  $("kpis").textContent = `已用 ${formatMmSs(elapsed)} · 剩余 ${remainingCount} · 预计剩余 ${formatMmSs(remainingMs)}`;
}

function renderIdle() {
  $("stageBadge").textContent = "未开始";
  $("timerBadge").textContent = "--";
  $("questionTitle").textContent = "选择范围并开启学习模式";
  $("answerBody").innerHTML = window.renderMarkdown
    ? window.renderMarkdown("提示：开启学习模式后，先等待 **10 秒** 再进入第一题。")
    : "提示：开启学习模式后，先等待 10 秒再进入第一题。";
  $("hint").textContent = "";
  if ($("learnCharCount")) $("learnCharCount").textContent = "字数：0";
  $("skipBtn").disabled = true;
  $("stopBtn").disabled = true;
  $("kpis").textContent = "已用 00:00 · 剩余 0 · 预计剩余 00:00";
}

function renderWarmup(nowMs) {
  $("stageBadge").textContent = "准备中";
  const left = Math.ceil(Math.max(0, state.warmupEndsAt - nowMs) / 1000);
  $("timerBadge").textContent = `${left}s`;
  $("questionTitle").textContent = "10 秒后开始学习（请坐直、深呼吸、进入状态）";
  $("answerBody").innerHTML = window.renderMarkdown
    ? window.renderMarkdown("准备期内不会计入题目倒计时，但会计入本轮学习已用时间。")
    : "准备期内不会计入题目倒计时，但会计入本轮学习已用时间。";
  $("hint").textContent = "准备结束后会自动进入第 1 题。";
  if ($("learnCharCount")) $("learnCharCount").textContent = "字数：0";
  $("skipBtn").disabled = true;
  $("stopBtn").disabled = false;
}

function renderRunning(nowMs) {
  const q = state.queue[state.idx];
  if (!q) return;
  $("stageBadge").textContent = q.kind === "forgot" ? "遗忘题" : "新题";
  const left = Math.ceil(Math.max(0, state.qEndsAt - nowMs) / 1000);
  $("timerBadge").textContent = `${left}s`;
  $("questionTitle").textContent = q.title;
  if ($("learnCharCount")) $("learnCharCount").textContent = `字数：题目 ${countChars(q.title)} · 答案 ${countChars(q.content)}`;
  $("answerBody").innerHTML = window.renderMarkdown ? window.renderMarkdown(q.content || "（无内容）") : (q.content || "（无内容）");
  const root = $("answerBody");
  if (window.applyHighlight) window.applyHighlight(root);
  else {
    window.__hljsPending = window.__hljsPending || [];
    window.__hljsPending.push(root);
  }
  const alloc = state.seconds[state.idx];
  $("hint").textContent = `本题预算：${alloc}s（根据你的背诵耗时自适应，当前节奏系数 x${state.paceMult.toFixed(2)}）`;
  $("skipBtn").disabled = false;
  $("stopBtn").disabled = false;
}

function renderDone() {
  $("stageBadge").textContent = "完成";
  $("timerBadge").textContent = "--";
  $("questionTitle").textContent = "本轮学习完成。建议休息 2-5 分钟再继续。";
  $("answerBody").innerHTML = window.renderMarkdown
    ? window.renderMarkdown("你可以再次开启学习模式：遗忘题/新题会按规则进入队列。")
    : "你可以再次开启学习模式：遗忘题/新题会按规则进入队列。";
  $("hint").textContent = "";
  if ($("learnCharCount")) $("learnCharCount").textContent = "字数：0";
  $("skipBtn").disabled = true;
  $("stopBtn").disabled = true;
}

function updateAdaptiveTiming(reason) {
  const q = state.queue[state.idx];
  if (!q || !state.qStartedAt) return;

  const now = Date.now();
  const spentSec = clamp(Math.round((now - state.qStartedAt) / 1000), 3, 3600);
  const allocated = Number(state.qAllocatedSec || state.seconds[state.idx] || 0);

  // 更新单题平均（EWMA）
  const map = state.qTimeMap || {};
  const rec = map[q.id] && typeof map[q.id] === "object" ? map[q.id] : { avg: spentSec, n: 0 };
  const prevAvg = typeof rec.avg === "number" ? rec.avg : spentSec;
  const nextAvg = rec.n >= 3 ? Math.round(prevAvg * 0.75 + spentSec * 0.25) : Math.round(prevAvg * 0.6 + spentSec * 0.4);
  map[q.id] = { avg: nextAvg, n: (rec.n || 0) + 1 };
  state.qTimeMap = map;
  saveQuestionTimeMap(map);

  // 更新全局节奏系数
  let mult = state.paceMult || loadPaceMultiplier();
  if (reason === "auto") {
    // 倒计时走完仍然强制下一题 => 当前预算偏短，整体拉长
    mult *= 1.15;
  } else if (reason === "skip") {
    // 提前结束视作“背会了”，根据相对耗时调整
    if (allocated > 0 && spentSec < allocated * 0.5) mult *= 0.95;
    else if (allocated > 0 && spentSec > allocated * 0.9) mult *= 1.05;
  }
  mult = clamp(mult, 0.9, 4.0);
  state.paceMult = mult;
  savePaceMultiplier(mult);

  // 用更新后的节奏重算“剩余题目预算”（让预计剩余时间更贴近当前节奏）
  for (let i = state.idx + 1; i < state.queue.length; i++) {
    state.seconds[i] = calcSecondsForQuestion(state.queue[i], state.paceMult, state.qTimeMap);
  }
}

async function advanceToNext(reason) {
  updateAdaptiveTiming(reason);
  const current = state.queue[state.idx];
  if (current) {
    // 学习（新题/遗忘）：根据是否“提前结束”决定一个初始自评，驱动后续复习优先级
    // - 提前结束：认为背会了 -> 给偏高分
    // - 倒计时走完仍自动下一题：认为不够熟 -> 给偏低分
    try {
      let quality = 3;
      if (reason === "auto") quality = current.kind === "forgot" ? 1 : 2;
      else if (reason === "skip") quality = current.kind === "forgot" ? 3 : 4;
      await apiPost("/api/review", { questionId: current.id, quality });
    } catch {
      // 忽略保存失败，仍然继续下一题，避免卡住
    }
  }
  state.idx += 1;
  if (state.idx >= state.queue.length) {
    state.stage = "done";
    state.qEndsAt = null;
    stopTimer();
    renderDone();
    setKpis(Date.now());
    return;
  }
  state.qStartedAt = Date.now();
  state.qAllocatedSec = state.seconds[state.idx];
  state.qEndsAt = state.qStartedAt + state.qAllocatedSec * 1000;
}

function tick() {
  const nowMs = Date.now();
  setKpis(nowMs);
  if (state.stage === "warmup") {
    renderWarmup(nowMs);
    if (nowMs >= state.warmupEndsAt) {
      state.stage = "running";
      state.qStartedAt = nowMs;
      state.qAllocatedSec = state.seconds[state.idx];
      state.qEndsAt = nowMs + state.qAllocatedSec * 1000;
      renderRunning(nowMs);
    }
    return;
  }
  if (state.stage === "running") {
    renderRunning(nowMs);
    if (nowMs >= state.qEndsAt) {
      // 到点立即下一题
      advanceToNext("auto");
    }
  }
}

async function refreshDbAndSelectors() {
  state.db = await apiGet("/api/db");
  fillSelect($("bankSelect"), state.db.banks || [], "全部题库");
  fillSelect($("chapterSelect"), [], "全部章节");
  setStats({ new: 0, forgot: 0, total: 0 });
}

async function fetchLearnQueue() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const limit = Math.max(5, Math.min(500, Number($("limitInput").value || 30)));
  const includeNew = $("includeNew").checked;
  const includeForgot = $("includeForgot").checked;

  const params = new URLSearchParams();
  if (bankId) params.set("bankId", bankId);
  if (chapterId) params.set("chapterId", chapterId);
  params.set("limit", String(limit));
  params.set("includeNew", includeNew ? "1" : "0");
  params.set("includeForgot", includeForgot ? "1" : "0");
  const data = await apiGet(`/api/queue/learn?${params.toString()}`);
  setStats(data.counts);
  return data.queue || [];
}

async function startLearning() {
  $("startBtn").disabled = true;
  try {
    stopTimer();
    state.paceMult = loadPaceMultiplier();
    state.qTimeMap = loadQuestionTimeMap();
    state.queue = await fetchLearnQueue();
    state.seconds = state.queue.map((q) => calcSecondsForQuestion(q, state.paceMult, state.qTimeMap));
    state.idx = 0;

    if (state.queue.length === 0) {
      renderIdle();
      $("answerBody").textContent = "当前范围没有新题或遗忘题。可换范围、导入题目，或去“学习页”复习到期题。";
      return;
    }

    state.stage = "warmup";
    state.startedAt = Date.now();
    state.warmupEndsAt = state.startedAt + 10_000;
    state.qStartedAt = null;
    state.qAllocatedSec = null;
    state.qEndsAt = null;
    $("stopBtn").disabled = false;
    state.timer = setInterval(tick, 250);
    tick();
  } finally {
    $("startBtn").disabled = false;
  }
}

function stopSession() {
  stopTimer();
  state.stage = "idle";
  state.queue = [];
  state.seconds = [];
  state.idx = 0;
  state.startedAt = null;
  state.warmupEndsAt = null;
  state.qStartedAt = null;
  state.qAllocatedSec = null;
  state.qEndsAt = null;
  renderIdle();
}

function bindEvents() {
  $("bankSelect").addEventListener("change", () => {
    fillChapters();
    renderIdle();
    setStats({ new: 0, forgot: 0, total: 0 });
  });
  $("chapterSelect").addEventListener("change", () => {
    renderIdle();
    setStats({ new: 0, forgot: 0, total: 0 });
  });

  $("startBtn").addEventListener("click", startLearning);
  $("skipBtn").addEventListener("click", async () => {
    if (state.stage !== "running") return;
    await advanceToNext("skip");
    tick();
  });
  $("stopBtn").addEventListener("click", () => {
    if (!confirm("确认结束本轮学习？")) return;
    stopSession();
  });
}

async function main() {
  bindEvents();
  await refreshDbAndSelectors();
  renderIdle();
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

