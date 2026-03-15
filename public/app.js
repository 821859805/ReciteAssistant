const $ = (id) => document.getElementById(id);

const state = {
  db: null,
  scope: { bankId: null, chapterId: null },
  queue: [],
  counts: { learned: 0, unlearned: 0, total: 0 },
  idx: 0,
  revealed: false,
  speech: {
    supported: false,
    listening: false,
    recognition: null
  }
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

function normalizeForCompare(text) {
  let s = String(text || "");

  // 先移除代码块（不参与比对）
  // 1) 围栏代码块（``` ... ```）
  s = s.replace(/```[\w-]*\n[\s\S]*?```/g, "");
  s = s.replace(/```[\s\S]*?```/g, "");

  // 2) 缩进代码块：行首 4 个空格或 1 个 tab（按行过滤）
  const lines = s.split("\n");
  const kept = [];
  for (const line of lines) {
    if (/^( {4,}|\t)/.test(line)) continue;
    kept.push(line);
  }
  s = kept.join("\n");

  s = s
    .toLowerCase()
    // 其他 Markdown/噪声
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/^\s*[-*+]\s+/gm, " ")
    .replace(/^\s*\d+\.\s+/gm, " ")
    .replace(/>\s?/g, " ")
    // 全角/半角空白和常见标点统一去掉
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()，。！？；：“”‘’《》【】（）—…、·]/g, "");
  return s;
}

function bigrams(str) {
  const s = String(str || "");
  if (s.length < 2) return [];
  const out = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

// Dice 系数：对中文按“字符二元组”很稳健；返回 0..1
function diceSimilarity(a, b) {
  const A = normalizeForCompare(a);
  const B = normalizeForCompare(b);
  if (!A && !B) return 1;
  if (!A || !B) return 0;
  if (A === B) return 1;
  const bgA = bigrams(A);
  const bgB = bigrams(B);
  if (bgA.length === 0 || bgB.length === 0) return 0;
  const map = new Map();
  for (const x of bgA) map.set(x, (map.get(x) || 0) + 1);
  let inter = 0;
  for (const y of bgB) {
    const c = map.get(y) || 0;
    if (c > 0) {
      inter += 1;
      map.set(y, c - 1);
    }
  }
  return (2 * inter) / (bgA.length + bgB.length);
}

function suggestStateFromSimilarity(sim01) {
  const s = Number(sim01);
  if (!Number.isFinite(s)) return 0;
  if (s >= 0.95) return 6;
  if (s >= 0.88) return 5;
  if (s >= 0.78) return 4;
  if (s >= 0.65) return 3;
  if (s >= 0.50) return 2;
  if (s >= 0.30) return 1;
  return 0;
}

function setRecallStatus(text) {
  const el = $("recallStatus");
  if (el) el.textContent = text || "";
}

function setRecallScore({ sim, suggestedState, note }) {
  const box = $("recallScore");
  if (!box) return;
  if (sim == null) {
    box.classList.remove("show", "good", "mid", "bad");
    box.innerHTML = "";
    return;
  }
  const pct = Math.round(sim * 100);
  box.classList.add("show");
  box.classList.remove("good", "mid", "bad");
  if (pct >= 80) box.classList.add("good");
  else if (pct >= 55) box.classList.add("mid");
  else box.classList.add("bad");
  box.innerHTML = `
    <div class="title">参考熟练度（基于相似度）</div>
    <div class="big">${pct}% · 建议熟练度 ${suggestedState}</div>
    <div class="small">${escapeHtml(note || "提示：相似度只能反映文字覆盖度，最终请结合理解与细节准确性设置熟练度。")}</div>
  `;
}

function stopSpeechIfNeeded() {
  const rec = state.speech && state.speech.recognition;
  if (rec && state.speech.listening) {
    try {
      rec.stop();
    } catch {
      // ignore
    }
  }
}

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    state.speech.supported = false;
    return;
  }
  state.speech.supported = true;
  const rec = new SR();
  rec.lang = "zh-CN";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  state.speech.recognition = rec;

  rec.onstart = () => {
    state.speech.listening = true;
    const startBtn = $("recallRecordBtn");
    const stopBtn = $("recallStopBtn");
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    setRecallStatus("录音中：请清晰口述（浏览器将语音转为文字填入回忆区）…");
  };
  rec.onend = () => {
    state.speech.listening = false;
    const startBtn = $("recallRecordBtn");
    const stopBtn = $("recallStopBtn");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    setRecallStatus("录音已停止。你可以编辑文字后提交对比。");
  };
  rec.onerror = (e) => {
    state.speech.listening = false;
    const startBtn = $("recallRecordBtn");
    const stopBtn = $("recallStopBtn");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    const msg = e && e.error ? `录音失败：${e.error}` : "录音失败：未知错误";
    setRecallStatus(`${msg}（可改用键盘输入）`);
  };
  rec.onresult = (ev) => {
    const input = $("recallInput");
    if (!input) return;
    let finalText = "";
    let interimText = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      const t = res && res[0] && res[0].transcript ? String(res[0].transcript) : "";
      if (res.isFinal) finalText += t;
      else interimText += t;
    }
    // 只把 final 结果追加到输入框（interim 用状态栏展示，避免来回抖动）
    if (finalText) {
      const sep = input.value && !/[\s\n]$/.test(input.value) ? " " : "";
      input.value = input.value + sep + finalText.trim();
    }
    if (interimText) setRecallStatus(`录音中（识别中）：${interimText.trim()}`);
  };
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
  stopSpeechIfNeeded();
  setRecallScore({ sim: null });
  if (state.speech.supported) setRecallStatus("提示：可先口述（语音转文字）或手动输入要点，再提交与标准答案做相似度对比。");
  else setRecallStatus("提示：你的浏览器不支持语音转文字（建议用 Chrome）。可手动输入要点后提交对比。");
  setRateEnabled(false);
  $("nextHint").textContent = "";
  updateNavButtons();
}

function setRateEnabled(enabled) {
  document.querySelectorAll(".rateBtn").forEach((b) => (b.disabled = !enabled));
}

function updateNavButtons() {
  const total = state.queue.length;
  const prevBtn = $("prevQuestionBtn");
  const nextBtn = $("nextQuestionBtn");
  if (prevBtn) prevBtn.disabled = state.idx <= 0 || total === 0;
  if (nextBtn) nextBtn.disabled = state.idx >= total - 1 || total === 0;
}

function goToPrevQuestion() {
  if (state.idx <= 0) return;
  state.idx -= 1;
  renderQuestion();
}

function goToNextQuestion() {
  const total = state.queue.length;
  if (state.idx >= total - 1) return;
  state.idx += 1;
  renderQuestion();
}

function renderQuestion() {
  const total = state.queue.length;
  if (total === 0) {
    setCardIdle("当前范围没有可复习题目（仅复习已学习题目）。请先去「学习（新题/遗忘）」学习。");
    updateNavButtons();
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
    $("nextHint").textContent = "可再次点击「开始学习」获取新队列（到期题会优先出现）。";
    updateNavButtons();
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
  stopSpeechIfNeeded();
  setRecallScore({ sim: null });
  setRateEnabled(false);
  $("nextHint").textContent = "先在「主动回忆区」写/说要点，再揭示答案并评分。";
  updateNavButtons();
}

async function refreshDbAndSelectors() {
  try {
    state.db = await apiGet("/api/db");

    const bankSel = $("bankSelect");
    const chapSel = $("chapterSelect");

    if (!bankSel || !chapSel) {
      console.error("下拉框元素不存在");
      return;
    }

    bankSel.innerHTML = "";
    const optAllBank = document.createElement("option");
    optAllBank.value = "";
    optAllBank.textContent = "全部题库";
    bankSel.appendChild(optAllBank);
    
    const banks = state.db?.banks || [];
    console.log("加载题库数量:", banks.length);
    for (const b of banks) {
      if (!b || !b.id) continue;
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name || "未命名题库";
      bankSel.appendChild(opt);
    }

    chapSel.innerHTML = "";
    const optAllChap = document.createElement("option");
    optAllChap.value = "";
    optAllChap.textContent = "全部章节";
    chapSel.appendChild(optAllChap);

    state.scope = { bankId: "", chapterId: "" };
    setStats();
  } catch (e) {
    console.error("加载题库失败:", e);
    alert(`加载题库失败：${e.message}`);
  }
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
  updateNavButtons();
}

function enableRateAfterReveal() {
  setRateEnabled(true);
  $("nextHint").textContent = "熟练度越低，复习时越优先出现。";
}

async function submitRating(quality) {
  const q = state.queue[state.idx];
  if (!q) return;
  try {
    const r = await apiPost("/api/review", { questionId: q.id, state: quality });
    const due = r && r.srs && r.srs.dueAt ? new Date(r.srs.dueAt) : null;
    const nextText = `已更新熟练度为 ${quality}（${["新题","学一遍","学两遍","初步掌握","基本掌握","熟练掌握","完全掌握"][quality] || ""}）`;
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

function bindEvents() {
  const bankSel = $("bankSelect");
  const chapSel = $("chapterSelect");
  
  if (bankSel) {
    bankSel.addEventListener("change", () => {
      fillChapters();
      setStats();
      setCardIdle();
    });
  }
  
  if (chapSel) {
    chapSel.addEventListener("change", () => {
      setStats();
      setCardIdle();
    });
  }

  $("startBtn").addEventListener("click", async () => {
    $("startBtn").disabled = true;
    try {
      await fetchQueue();
    } finally {
      $("startBtn").disabled = false;
    }
  });

  $("prevQuestionBtn")?.addEventListener("click", () => {
    goToPrevQuestion();
  });

  $("nextQuestionBtn")?.addEventListener("click", () => {
    goToNextQuestion();
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

  // recall tools
  $("recallClearBtn")?.addEventListener("click", () => {
    $("recallInput").value = "";
    setRecallScore({ sim: null });
    if (state.speech.listening) setRecallStatus("录音中：请清晰口述（浏览器将语音转为文字填入回忆区）…");
    else if (state.speech.supported) setRecallStatus("已清空。可继续口述或输入，然后提交对比。");
    else setRecallStatus("已清空。请输入要点后提交对比。");
  });

  $("recallRecordBtn")?.addEventListener("click", async () => {
    if (!state.speech.supported || !state.speech.recognition) {
      setRecallStatus("你的浏览器不支持语音转文字（建议用 Chrome）。可改用键盘输入。");
      return;
    }
    try {
      // 某些浏览器在非 HTTPS/非 localhost 下会拒绝麦克风；这里给清晰提示
      setRecallStatus("准备启动录音：浏览器可能会弹出麦克风权限请求…");
      state.speech.recognition.start();
    } catch (e) {
      setRecallStatus(`录音启动失败：${e && e.message ? e.message : "未知错误"}（可改用键盘输入）`);
    }
  });

  $("recallStopBtn")?.addEventListener("click", () => {
    stopSpeechIfNeeded();
  });

  $("recallSubmitBtn")?.addEventListener("click", () => {
    const q = state.queue[state.idx];
    if (!q) return;
    const userAns = $("recallInput").value || "";
    const gold = q.content || "";
    const sim = diceSimilarity(userAns, gold);
    const suggestedState = suggestStateFromSimilarity(sim);
    const note = `你的输入字数：${countChars(userAns)}；标准答案字数：${countChars(gold)}。建议：先看相似度，再结合关键点是否缺失/是否理解来设置熟练度。`;
    setRecallScore({ sim, suggestedState, note });
    $("nextHint").textContent = "已给出参考熟练度：可选择揭示答案核对细节，再设置最终熟练度（0-6）。";
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

}

async function main() {
  try {
    bindEvents();
    initSpeechRecognition();
    await refreshDbAndSelectors();
    setCardIdle("已就绪：选择范围并点击「开始学习」。");
  } catch (e) {
    console.error("启动失败:", e);
    alert(`启动失败：${e.message}`);
  }
}

// 脚本在 body 底部加载，DOM 应该已经准备好了
main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

