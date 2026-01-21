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

// 倒计时：按答案长度（中文）估算阅读+编码时间
// 假设有效字符读取速度约 7 字/秒，并留出 40% 的“编码/复述”缓冲；再加一个基础启动时间。
function calcSecondsFromContent(content) {
  const text = String(content || "");
  const chars = text.replace(/\s+/g, "").length;
  const read = chars / 7;
  const encode = read * 0.4;
  const base = 8;
  const sec = Math.round(base + read + encode);
  return clamp(sec, 15, 120);
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
  qEndsAt: null,
  timer: null
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
  $("answerBody").innerHTML = window.renderMarkdown ? window.renderMarkdown(q.content || "（无内容）") : (q.content || "（无内容）");
  const root = $("answerBody");
  if (window.applyHighlight) window.applyHighlight(root);
  else {
    window.__hljsPending = window.__hljsPending || [];
    window.__hljsPending.push(root);
  }
  $("hint").textContent = `本题倒计时：${state.seconds[state.idx]}s（按答案长度估算）`;
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
  $("skipBtn").disabled = true;
  $("stopBtn").disabled = true;
}

async function advanceToNext() {
  const current = state.queue[state.idx];
  if (current) {
    // 学习模式默认给一个“还行(3)”的复习质量，避免永远停留在新题/遗忘题池
    // 用户需要更细的控制可回到“学习页”用 0-5 自评。
    try {
      await apiPost("/api/review", { questionId: current.id, quality: 3 });
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
  state.qEndsAt = Date.now() + state.seconds[state.idx] * 1000;
}

function tick() {
  const nowMs = Date.now();
  setKpis(nowMs);
  if (state.stage === "warmup") {
    renderWarmup(nowMs);
    if (nowMs >= state.warmupEndsAt) {
      state.stage = "running";
      state.qEndsAt = nowMs + state.seconds[state.idx] * 1000;
      renderRunning(nowMs);
    }
    return;
  }
  if (state.stage === "running") {
    renderRunning(nowMs);
    if (nowMs >= state.qEndsAt) {
      // 到点立即下一题
      advanceToNext();
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
    state.queue = await fetchLearnQueue();
    state.seconds = state.queue.map((q) => calcSecondsFromContent(q.content));
    state.idx = 0;

    if (state.queue.length === 0) {
      renderIdle();
      $("answerBody").textContent = "当前范围没有新题或遗忘题。可换范围、导入题目，或去“学习页”复习到期题。";
      return;
    }

    state.stage = "warmup";
    state.startedAt = Date.now();
    state.warmupEndsAt = state.startedAt + 10_000;
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
    await advanceToNext();
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

