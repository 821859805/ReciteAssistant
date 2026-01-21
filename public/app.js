const $ = (id) => document.getElementById(id);

const state = {
  db: null,
  scope: { bankId: null, chapterId: null },
  queue: [],
  counts: { learned: 0, unlearned: 0, total: 0 },
  idx: 0,
  revealed: false
};

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function countChars(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return await res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return await res.json();
}

function setStats() {
  const s = state.counts;
  const scopeLabel = scopeLabelText();
  $("stats").innerHTML = `
    <div><b>范围</b>：${escapeHtml(scopeLabel)}</div>
    <div><b>已学习</b>：${s.learned}，<b>未学习</b>：${s.unlearned}，<b>总题</b>：${s.total}</div>
    <div><b>提示</b>：未学习题目不会出现在复习队列，请先去“学习（新题/遗忘）”。</div>
  `;
}

function scopeLabelText() {
  const bankSel = $("bankSelect");
  const chapSel = $("chapterSelect");
  const bank = bankSel && bankSel.value ? bankSel.options[bankSel.selectedIndex].text : "全部题库";
  const chap = chapSel && chapSel.value ? chapSel.options[chapSel.selectedIndex].text : "全部章节";
  return `${bank} / ${chap}`;
}

function setCardIdle(msg) {
  $("queueBadge").textContent = "未开始";
  $("counter").textContent = "0 / 0";
  $("questionTitle").textContent = msg || "选择范围并开始学习";
  $("answerBody").classList.add("hidden");
  $("answerBody").textContent = "";
  $("toggleAnswerBtn").textContent = "显示答案";
  if ($("reviewCharCount")) $("reviewCharCount").textContent = "字数：0";
  $("recallInput").value = "";
  state.revealed = false;
  setRateEnabled(false);
  $("nextHint").textContent = "";
}

function setRateEnabled(enabled) {
  document.querySelectorAll(".rateBtn").forEach((b) => (b.disabled = !enabled));
}

function renderQuestion() {
  const total = state.queue.length;
  if (total === 0) {
    setCardIdle("当前范围没有可复习题目（仅复习已学习题目）。请先去“学习（新题/遗忘）”学习。");
    return;
  }
  if (state.idx >= total) {
    $("queueBadge").textContent = "完成";
    $("counter").textContent = `${total} / ${total}`;
    $("questionTitle").textContent = "本轮学习完成。建议休息 2-5 分钟再继续。";
    $("answerBody").classList.add("hidden");
    $("answerBody").textContent = "";
    $("toggleAnswerBtn").textContent = "显示答案";
    $("recallInput").value = "";
    state.revealed = false;
    setRateEnabled(false);
    $("nextHint").textContent = "可再次点击“开始学习”获取新队列（到期题会优先出现）。";
    return;
  }

  const q = state.queue[state.idx];
  $("queueBadge").textContent = "复习";
  $("counter").textContent = `${state.idx + 1} / ${total}`;
  $("questionTitle").textContent = q.title;
  if ($("reviewCharCount")) $("reviewCharCount").textContent = `字数：题目 ${countChars(q.title)} · 答案 ${countChars(q.content)}`;
  $("answerBody").innerHTML = window.renderMarkdown ? window.renderMarkdown(q.content || "") : escapeHtml(q.content || "（无内容）");
  const root = $("answerBody");
  if (window.applyHighlight) window.applyHighlight(root);
  else {
    window.__hljsPending = window.__hljsPending || [];
    window.__hljsPending.push(root);
  }
  $("answerBody").classList.add("hidden");
  $("toggleAnswerBtn").textContent = "显示答案";
  $("recallInput").value = "";
  state.revealed = false;
  setRateEnabled(false);
  $("nextHint").textContent = "先在“主动回忆区”写/说要点，再揭示答案并评分。";
}

async function refreshDbAndSelectors() {
  state.db = await apiGet("/api/db");

  const bankSel = $("bankSelect");
  const chapSel = $("chapterSelect");

  bankSel.innerHTML = "";
  const optAllBank = document.createElement("option");
  optAllBank.value = "";
  optAllBank.textContent = "全部题库";
  bankSel.appendChild(optAllBank);
  for (const b of state.db.banks || []) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.name;
    bankSel.appendChild(opt);
  }

  chapSel.innerHTML = "";
  const optAllChap = document.createElement("option");
  optAllChap.value = "";
  optAllChap.textContent = "全部章节";
  chapSel.appendChild(optAllChap);

  state.scope = { bankId: "", chapterId: "" };
  setStats();
}

function fillChapters() {
  const bankId = $("bankSelect").value;
  const chapSel = $("chapterSelect");
  chapSel.innerHTML = "";

  const optAllChap = document.createElement("option");
  optAllChap.value = "";
  optAllChap.textContent = "全部章节";
  chapSel.appendChild(optAllChap);

  const bank = (state.db.banks || []).find((b) => b.id === bankId);
  if (!bank) return;
  for (const c of bank.chapters || []) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    chapSel.appendChild(opt);
  }
}

async function fetchQueue() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const limit = Math.max(5, Math.min(200, Number($("limitInput").value || 30)));
  const params = new URLSearchParams();
  if (bankId) params.set("bankId", bankId);
  if (chapterId) params.set("chapterId", chapterId);
  params.set("limit", String(limit));

  const data = await apiGet(`/api/queue/review?${params.toString()}`);
  state.queue = data.queue || [];
  state.counts = data.counts || state.counts;
  state.idx = 0;
  setStats();
  renderQuestion();
}

function enableRateAfterReveal() {
  setRateEnabled(true);
  $("nextHint").textContent = "评分会更新下次出现时间：分数越低，越快再出现；越高，间隔越长。";
}

async function submitRating(quality) {
  const q = state.queue[state.idx];
  if (!q) return;
  try {
    const r = await apiPost("/api/review", { questionId: q.id, quality });
    const due = r && r.srs && r.srs.dueAt ? new Date(r.srs.dueAt) : null;
    const nextText = due ? `下次复习：${due.toLocaleString()}` : "已保存复习结果";
    $("nextHint").textContent = nextText;
  } catch (e) {
    $("nextHint").textContent = `保存失败：${e.message}`;
    return;
  }
  state.idx += 1;
  state.revealed = false;
  setRateEnabled(false);
  setTimeout(renderQuestion, 200);
}

async function importDbFile(file) {
  const text = await file.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    alert("导入失败：不是合法 JSON");
    return;
  }
  await apiPost("/api/import", json);
  await refreshDbAndSelectors();
  setCardIdle("导入完成。请选择范围并开始学习。");
}

function bindEvents() {
  $("bankSelect").addEventListener("change", () => {
    fillChapters();
    setStats();
    setCardIdle();
  });
  $("chapterSelect").addEventListener("change", () => {
    setStats();
    setCardIdle();
  });

  $("startBtn").addEventListener("click", async () => {
    $("startBtn").disabled = true;
    try {
      await fetchQueue();
    } finally {
      $("startBtn").disabled = false;
    }
  });

  $("toggleAnswerBtn").addEventListener("click", () => {
    const body = $("answerBody");
    const hidden = body.classList.contains("hidden");
    if (hidden) {
      body.classList.remove("hidden");
      $("toggleAnswerBtn").textContent = "隐藏答案";
      state.revealed = true;
      enableRateAfterReveal();
    } else {
      body.classList.add("hidden");
      $("toggleAnswerBtn").textContent = "显示答案";
      state.revealed = false;
      setRateEnabled(false);
      $("nextHint").textContent = "再次遮盖后，先回忆再揭示并评分。";
    }
  });

  document.querySelectorAll(".rateBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!state.revealed) return;
      const q = Number(btn.dataset.q);
      // prevent double click
      setRateEnabled(false);
      await submitRating(q);
    });
  });

  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await importDbFile(f);
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      e.target.value = "";
    }
  });
}

async function main() {
  bindEvents();
  await refreshDbAndSelectors();
  setCardIdle("已就绪：选择范围并点击“开始学习”。");
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

