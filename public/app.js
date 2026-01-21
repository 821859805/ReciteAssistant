const $ = (id) => document.getElementById(id);

const state = {
  db: null,
  mode: "mixed",
  scope: { bankId: null, chapterId: null, sectionId: null },
  queue: [],
  counts: { due: 0, new: 0, total: 0 },
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

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".segBtn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function setStats() {
  const s = state.counts;
  const scopeLabel = scopeLabelText();
  $("stats").innerHTML = `
    <div><b>范围</b>：${escapeHtml(scopeLabel)}</div>
    <div><b>到期复习</b>：${s.due}，<b>新题</b>：${s.new}，<b>总题</b>：${s.total}</div>
    <div><b>提示</b>：优先完成到期复习，再用混合模式穿插新题。</div>
  `;
}

function scopeLabelText() {
  const bankSel = $("bankSelect");
  const chapSel = $("chapterSelect");
  const secSel = $("sectionSelect");
  const bank = bankSel && bankSel.value ? bankSel.options[bankSel.selectedIndex].text : "全部题库";
  const chap = chapSel && chapSel.value ? chapSel.options[chapSel.selectedIndex].text : "全部章节";
  const sec = secSel && secSel.value ? secSel.options[secSel.selectedIndex].text : "全部小节";
  return `${bank} / ${chap} / ${sec}`;
}

function setCardIdle(msg) {
  $("queueBadge").textContent = "未开始";
  $("counter").textContent = "0 / 0";
  $("questionTitle").textContent = msg || "选择范围并开始学习";
  $("answerBody").classList.add("hidden");
  $("answerBody").textContent = "";
  $("toggleAnswerBtn").textContent = "显示答案";
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
    setCardIdle("当前范围没有题目，或队列为空（可切换模式/范围或导入题目）。");
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
  $("queueBadge").textContent = state.mode === "due" ? "复习" : state.mode === "new" ? "新题" : "混合";
  $("counter").textContent = `${state.idx + 1} / ${total}`;
  $("questionTitle").textContent = q.title;
  $("answerBody").textContent = q.content || "（无内容）";
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
  const secSel = $("sectionSelect");

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
  secSel.innerHTML = "";
  const optAllChap = document.createElement("option");
  optAllChap.value = "";
  optAllChap.textContent = "全部章节";
  chapSel.appendChild(optAllChap);
  const optAllSec = document.createElement("option");
  optAllSec.value = "";
  optAllSec.textContent = "全部小节";
  secSel.appendChild(optAllSec);

  state.scope = { bankId: "", chapterId: "", sectionId: "" };
  setStats();
}

function fillChapters() {
  const bankId = $("bankSelect").value;
  const chapSel = $("chapterSelect");
  const secSel = $("sectionSelect");
  chapSel.innerHTML = "";
  secSel.innerHTML = "";

  const optAllChap = document.createElement("option");
  optAllChap.value = "";
  optAllChap.textContent = "全部章节";
  chapSel.appendChild(optAllChap);

  const optAllSec = document.createElement("option");
  optAllSec.value = "";
  optAllSec.textContent = "全部小节";
  secSel.appendChild(optAllSec);

  const bank = (state.db.banks || []).find((b) => b.id === bankId);
  if (!bank) return;
  for (const c of bank.chapters || []) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    chapSel.appendChild(opt);
  }
}

function fillSections() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const secSel = $("sectionSelect");
  secSel.innerHTML = "";
  const optAllSec = document.createElement("option");
  optAllSec.value = "";
  optAllSec.textContent = "全部小节";
  secSel.appendChild(optAllSec);

  const bank = (state.db.banks || []).find((b) => b.id === bankId);
  if (!bank) return;
  const chapter = (bank.chapters || []).find((c) => c.id === chapterId);
  if (!chapter) return;
  for (const s of chapter.sections || []) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    secSel.appendChild(opt);
  }
}

async function fetchQueue() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const sectionId = $("sectionSelect").value;
  const limit = Math.max(5, Math.min(200, Number($("limitInput").value || 30)));
  const params = new URLSearchParams();
  if (bankId) params.set("bankId", bankId);
  if (chapterId) params.set("chapterId", chapterId);
  if (sectionId) params.set("sectionId", sectionId);
  params.set("mode", state.mode);
  params.set("limit", String(limit));

  const data = await apiGet(`/api/queue?${params.toString()}`);
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

async function importQuestionsToCurrentSection() {
  const bankId = $("bankSelect").value;
  const chapterId = $("chapterSelect").value;
  const sectionId = $("sectionSelect").value;
  if (!bankId || !chapterId || !sectionId) {
    $("importQuestionsMsg").textContent = "请先在左侧选择到“具体小节”，再导入。";
    return;
  }
  const text = $("importQuestionsText").value.trim();
  if (!text) return;
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    $("importQuestionsMsg").textContent = "JSON 解析失败，请检查格式。";
    return;
  }
  if (!Array.isArray(arr)) {
    $("importQuestionsMsg").textContent = "需要一个 JSON 数组。";
    return;
  }
  const r = await apiPost("/api/questions", { bankId, chapterId, sectionId, questions: arr });
  $("importQuestionsMsg").textContent = `导入完成：新增 ${r.inserted || 0} 题。`;
  await refreshDbAndSelectors();
  // restore selection
  $("bankSelect").value = bankId;
  fillChapters();
  $("chapterSelect").value = chapterId;
  fillSections();
  $("sectionSelect").value = sectionId;
}

function bindEvents() {
  document.querySelectorAll(".segBtn").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  setMode("mixed");

  $("bankSelect").addEventListener("change", () => {
    fillChapters();
    fillSections();
    setStats();
    setCardIdle();
  });
  $("chapterSelect").addEventListener("change", () => {
    fillSections();
    setStats();
    setCardIdle();
  });
  $("sectionSelect").addEventListener("change", () => {
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

  $("importQuestionsBtn").addEventListener("click", async () => {
    $("importQuestionsBtn").disabled = true;
    try {
      await importQuestionsToCurrentSection();
    } catch (e) {
      $("importQuestionsMsg").textContent = `导入失败：${e.message}`;
    } finally {
      $("importQuestionsBtn").disabled = false;
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

