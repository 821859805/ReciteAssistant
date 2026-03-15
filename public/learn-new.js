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

// 基础时长（秒）：按内容长度给一个“足够背会”的初始预算（相当于之前的4倍时间）
function baseSecondsFromContent(content) {
  const chars = countEffectiveChars(content);
  // 经验值：基础 30s + 1.20s/字（相当于之前的4倍）；并给出更大的上限
  // 200 字 ≈ 270s；500 字 ≈ 630s；1000 字 ≈ 1230s
  const sec = Math.round(30 + chars * 1.2);
  return clamp(sec, 60, 900);
}

function calcSecondsForQuestion(q, paceMult, qTimeMap) {
  const base = baseSecondsFromContent(q?.content);
  const st = q?.srs?.state || 0;
  // 熟练度越高，分配时间越少
  const stateMultipliers = [1.0, 0.8, 0.65, 0.55, 0.45, 0.35, 0.3];
  const mult = stateMultipliers[st] ?? 0.3;
  const sec = Math.round(base * mult);
  return clamp(sec, 30, 900);
}

const STATE_LABELS = ["新题", "学习一遍", "学习两遍", "初步掌握", "基本掌握", "熟练掌握", "完全掌握"];

const state = {
  db: null,
  selectedStates: new Set([0, 1]),
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
  const c = counts || { matched: 0, total: 0, byState: {} };
  $("stats").innerHTML = `
    <div><b>范围</b>：${scopeLabel}</div>
    <div><b>已筛选</b>：${c.matched}，<b>总题</b>：${c.total}</div>
  `;
  // 更新各状态的题目数量
  const byState = c.byState || {};
  for (let i = 0; i <= 6; i++) {
    const el = $(`stateCount${i}`);
    if (el) el.textContent = byState[i] || 0;
  }
}

function fillSelect(selectEl, items, allLabel) {
  if (!selectEl) {
    console.error("fillSelect: selectEl is null");
    return;
  }
  selectEl.innerHTML = "";
  selectEl.disabled = false; // 确保下拉框没有被禁用
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
  const timerBar = $("questionTimerBar");
  if (timerBar) timerBar.style.display = "none";
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
  const timerBar = $("questionTimerBar");
  if (timerBar) timerBar.style.display = "none";
}

function renderRunning(nowMs) {
  const q = state.queue[state.idx];
  if (!q) return;
  const qState = q.state != null ? q.state : (q.srs?.state || 0);
  $("stageBadge").textContent = `熟练度 ${qState} - ${STATE_LABELS[qState] || "未知"}`;
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

  // 更新倒计时衰减进度条
  const timerBar = $("questionTimerBar");
  const timerFill = $("questionTimerFill");
  if (timerBar && timerFill && state.qAllocatedSec) {
    timerBar.style.display = "block";
    const elapsed = Math.max(0, (nowMs - state.qStartedAt) / 1000);
    const remaining = Math.max(0, state.qAllocatedSec - elapsed);
    const percent = (remaining / state.qAllocatedSec) * 100;
    timerFill.style.width = `${percent}%`;
  }
}

function updateProgress() {
  const progressEl = $("learningProgress");
  const progressFill = $("progressFill");
  const progressText = $("progressText");

  if (!progressEl || !progressFill || !progressText) return;

  const current = state.idx + 1; // 当前已完成的题目数
  const total = state.queue.length;

  if (total === 0) {
    progressEl.style.display = "none";
    return;
  }

  progressEl.style.display = "block";
  const percentage = (current / total) * 100;
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${current}/${total}`;
}

function renderDone() {
  $("stageBadge").textContent = "完成";
  $("timerBadge").textContent = "--";
  $("questionTitle").textContent = "本轮学习完成。建议休息 2-5 分钟再继续。";
  $("answerBody").innerHTML = window.renderMarkdown
    ? window.renderMarkdown("你可以再次开启学习模式：选中熟练度的题目会按规则进入队列。")
    : "你可以再次开启学习模式：选中熟练度的题目会按规则进入队列。";
  $("hint").textContent = "";
  if ($("learnCharCount")) $("learnCharCount").textContent = "字数：0";
  $("skipBtn").disabled = true;
  $("stopBtn").disabled = true;
  updateProgress(); // 完成时更新进度
  const timerBar = $("questionTimerBar");
  if (timerBar) timerBar.style.display = "none";
  exitFullscreen(); // 退出全屏
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
  // 不再进行动态时间调整
  const current = state.queue[state.idx];
  if (current) {
    // 学习：提前结束和自动结束都给质量1，只用于状态迁移
    try {
      const quality = 1; // 统一使用质量1进行状态迁移
      await apiPost("/api/review", { questionId: current.id, quality });
    } catch {
      // 忽略保存失败，仍然继续下一题，避免卡住
    }
  }
  state.idx += 1;
  updateProgress(); // 更新进度条
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
  const bankSelect = $("bankSelect");
  const chapterSelect = $("chapterSelect");
  
  if (!bankSelect) {
    console.error("bankSelect element not found");
    return;
  }
  if (!chapterSelect) {
    console.error("chapterSelect element not found");
    return;
  }
  
  fillSelect(bankSelect, state.db.banks || [], "全部题库");
  fillSelect(chapterSelect, [], "全部章节");
}

function getSelectedStates() {
  const checkboxes = document.querySelectorAll("#stateSelectDropdown input[type='checkbox']");
  const selected = new Set();
  for (const cb of checkboxes) {
    if (cb.checked) selected.add(Number(cb.value));
  }
  return selected;
}

function buildLearnParams() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const selected = getSelectedStates();
  state.selectedStates = selected;
  const params = new URLSearchParams();
  if (bankId) params.set("bankId", bankId);
  if (chapterId) params.set("chapterId", chapterId);
  params.set("states", [...selected].join(","));
  return params;
}

async function refreshStats() {
  try {
    const params = buildLearnParams();
    const data = await apiGet(`/api/queue/learn?${params.toString()}`);
    setStats(data.counts);
  } catch (e) {
    console.error("refreshStats failed:", e);
  }
}

async function fetchLearnQueue() {
  const params = buildLearnParams();
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
      $("answerBody").textContent = "当前范围和所选熟练度下没有匹配的题目。请尝试更换范围或选择其他熟练度。";
      return;
    }

    // 初始化进度条
    updateProgress();

    // 进入全屏模式
    enterFullscreen();

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

function enterFullscreen() {
  // 进入全屏
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(err => console.log("全屏失败:", err));
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }

  // 防止切换页面
  window.addEventListener("beforeunload", preventLeave);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function exitFullscreen() {
  // 退出全屏
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }

  // 移除防止切换页面的监听
  window.removeEventListener("beforeunload", preventLeave);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

function preventLeave(e) {
  if (state.stage === "warmup" || state.stage === "running") {
    e.preventDefault();
    e.returnValue = "学习进行中，确定要离开吗？";
    return e.returnValue;
  }
}

function handleVisibilityChange() {
  if (document.hidden && (state.stage === "warmup" || state.stage === "running")) {
    // 如果页面被隐藏，尝试重新获取焦点
    window.focus();
    alert("学习进行中，请保持页面可见！");
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
  exitFullscreen(); // 退出全屏
}

function initMultiSelect() {
  const trigger = $("stateSelectTrigger");
  const dropdown = $("stateSelectDropdown");
  if (!trigger || !dropdown) return;

  function updateTriggerText() {
    const selected = getSelectedStates();
    state.selectedStates = selected;
    if (selected.size === 0) {
      $("stateSelectText").textContent = "未选择任何熟练度";
    } else if (selected.size === 7) {
      $("stateSelectText").textContent = "全部熟练度";
    } else {
      $("stateSelectText").textContent = "熟练度 " + [...selected].sort((a, b) => a - b).join(", ");
    }
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
    trigger.classList.toggle("open");
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#stateMultiSelect")) {
      if (dropdown.classList.contains("open")) {
        dropdown.classList.remove("open");
        trigger.classList.remove("open");
      }
    }
  });

  const checkboxes = dropdown.querySelectorAll("input[type='checkbox']");
  for (const cb of checkboxes) {
    cb.addEventListener("change", () => {
      updateTriggerText();
      refreshStats();
    });
  }

  $("stateSelectAll").addEventListener("click", (e) => {
    e.preventDefault();
    for (const cb of checkboxes) cb.checked = true;
    updateTriggerText();
    refreshStats();
  });

  $("stateSelectNone").addEventListener("click", (e) => {
    e.preventDefault();
    for (const cb of checkboxes) cb.checked = false;
    updateTriggerText();
    refreshStats();
  });

  updateTriggerText();
}

function bindEvents() {
  $("bankSelect").addEventListener("change", () => {
    fillChapters();
    renderIdle();
    refreshStats();
  });
  $("chapterSelect").addEventListener("change", () => {
    renderIdle();
    refreshStats();
  });

  initMultiSelect();

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

  // 监听全屏状态变化
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && (state.stage === "warmup" || state.stage === "running")) {
      // 如果意外退出全屏，尝试重新进入
      setTimeout(() => enterFullscreen(), 100);
    }
  });
  document.addEventListener("webkitfullscreenchange", () => {
    if (!document.webkitFullscreenElement && (state.stage === "warmup" || state.stage === "running")) {
      setTimeout(() => enterFullscreen(), 100);
    }
  });
  document.addEventListener("msfullscreenchange", () => {
    if (!document.msFullscreenElement && (state.stage === "warmup" || state.stage === "running")) {
      setTimeout(() => enterFullscreen(), 100);
    }
  });
}

async function main() {
  bindEvents();
  await refreshDbAndSelectors();
  renderIdle();
  refreshStats();
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

