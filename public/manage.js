const $ = (id) => document.getElementById(id);

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
    return await r.json();
  },
  async post(path, body) {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`POST ${path} ${r.status} ${await r.text()}`);
    return await r.json();
  },
  async put(path, body) {
    const r = await fetch(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`PUT ${path} ${r.status} ${await r.text()}`);
    return await r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: "DELETE" });
    if (!r.ok) throw new Error(`DELETE ${path} ${r.status} ${await r.text()}`);
    return await r.json();
  }
};

const state = {
  db: null,
  selected: { bankId: null, chapterId: null, questionId: null },
  focusAfterRender: null,
  dirty: { content: false }
};

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function selectedBank() {
  return (state.db?.banks || []).find((b) => b.id === state.selected.bankId) || null;
}
function selectedChapter() {
  const b = selectedBank();
  return b ? (b.chapters || []).find((c) => c.id === state.selected.chapterId) || null : null;
}
function selectedQuestion() {
  const c = selectedChapter();
  return c ? (c.questions || []).find((q) => q.id === state.selected.questionId) || null : null;
}

function ensureSelectionValid() {
  const bank = selectedBank();
  if (!bank) {
    state.selected.bankId = null;
    state.selected.chapterId = null;
    state.selected.questionId = null;
    return;
  }
  const chapter = selectedChapter();
  if (!chapter) {
    state.selected.chapterId = null;
    state.selected.questionId = null;
    return;
  }
  const q = selectedQuestion();
  if (!q) state.selected.questionId = null;
}

function currentScopeText() {
  const b = selectedBank();
  const c = selectedChapter();
  const parts = [b ? b.name : "未选题库", c ? c.name : "未选章节"];
  return parts.join(" / ");
}

async function reloadDb() {
  state.db = await api.get("/api/db");
}

async function safeBlurSaveQuestion() {
  // blur 触发保存：避免切换目录时丢改动
  if (!state.dirty.content) return;
  await saveQuestionContentIfNeeded();
}

function syncEditorFromSelectedQuestion() {
  const q = selectedQuestion();
  const contentEl = $("qContent");
  const delBtn = $("deleteQuestionBtn");
  const titleHint = $("questionTitleHint");
  const previewEl = $("qPreview");

  if (!q) {
    contentEl.value = "";
    contentEl.disabled = true;
    delBtn.disabled = true;
    titleHint.textContent = "未选中题目（请在左侧选择题目）";
    previewEl.innerHTML = `<div class="muted">未选中题目</div>`;
    $("saveMsg").textContent = "";
    state.dirty.content = false;
    return;
  }

  contentEl.disabled = false;
  delBtn.disabled = false;
  contentEl.value = q.content || "";
  titleHint.textContent = `当前题目：${q.title}`;
  previewEl.innerHTML = window.renderMarkdown ? window.renderMarkdown(q.content || "") : escapeHtml(q.content || "");
  state.dirty.content = false;
  $("saveMsg").textContent = "";
}

function renderScopeHint() {
  $("scopeHint").textContent = `当前：${currentScopeText()}`;
}

function renderTree() {
  const tree = $("tree");
  const banks = (state.db?.banks || []).filter(Boolean);
  if (banks.length === 0) {
    tree.innerHTML = `<div class="muted">暂无题库，请先点击“+ 题库”</div>`;
    return;
  }

  const html = [];
  for (const b of banks) {
    const bankActive = state.selected.bankId === b.id;
    html.push(`
      <div class="treeNode ${bankActive ? "active" : ""}" data-level="bank" data-bank-id="${escapeHtml(b.id)}">
        <div class="treeRow">
          <span class="treeDot l1"></span>
          <input class="treeInput" data-level="bank" data-bank-id="${escapeHtml(b.id)}" value="${escapeHtml(b.name)}" />
          <div class="treeBtns">
            <button class="miniBtn add" data-action="addChapter" title="新增章节">+章</button>
            <button class="miniBtn danger del" data-action="delBank" title="删除题库">删</button>
          </div>
        </div>
      </div>
    `);

    const chapters = (Array.isArray(b.chapters) ? b.chapters : []).filter(Boolean);
    for (const c of chapters) {
      const chapActive = bankActive && state.selected.chapterId === c.id;
      html.push(`
        <div class="treeNode ${chapActive ? "active" : ""}" data-level="chapter" data-bank-id="${escapeHtml(b.id)}" data-chapter-id="${escapeHtml(c.id)}">
          <div class="treeRow indent1">
            <span class="treeDot l2"></span>
            <input class="treeInput" data-level="chapter" data-bank-id="${escapeHtml(b.id)}" data-chapter-id="${escapeHtml(c.id)}" value="${escapeHtml(
        c.name
      )}" />
            <div class="treeBtns">
              <button class="miniBtn add" data-action="addQuestion" title="新增题目">+题</button>
              <button class="miniBtn danger del" data-action="delChapter" title="删除章节">删</button>
            </div>
          </div>
        </div>
      `);

      // questions under chapter
      const questions = (Array.isArray(c.questions) ? c.questions : []).filter(Boolean);
      for (const q of questions) {
        const qActive = chapActive && state.selected.questionId === q.id;
        const meta = q.srs?.lastReviewedAt ? `上次：${new Date(q.srs.lastReviewedAt).toLocaleDateString()}` : "未学";
        html.push(`
          <div class="treeNode ${qActive ? "active" : ""}" data-level="question" data-bank-id="${escapeHtml(b.id)}" data-chapter-id="${escapeHtml(
          c.id
        )}" data-question-id="${escapeHtml(q.id)}">
            <div class="treeRow indent2">
              <span class="treeDot l3"></span>
              <input class="treeInput" data-level="question" data-question-id="${escapeHtml(q.id)}" value="${escapeHtml(q.title)}" />
              <div class="treeMeta muted">${escapeHtml(meta)}</div>
              <div class="treeBtns">
                <button class="miniBtn danger del" data-action="delQuestion" title="删除题目">删</button>
              </div>
            </div>
          </div>
        `);
      }
    }
  }

  tree.innerHTML = html.join("");

  // selection click
  tree.querySelectorAll(".treeNode").forEach((node) => {
    node.addEventListener("click", (e) => {
      const t = e.target;
      if (t.classList && (t.classList.contains("treeInput") || t.classList.contains("miniBtn"))) return;
      const level = node.dataset.level;
      const bankId = node.dataset.bankId;
      const chapterId = node.dataset.chapterId || null;
      const questionId = node.dataset.questionId || null;
      safeBlurSaveQuestion().finally(() => {
        state.selected.bankId = bankId || null;
        state.selected.chapterId = level === "bank" ? null : chapterId;
        state.selected.questionId = level === "question" ? questionId : null;
        syncEditorFromSelectedQuestion();
        renderAll();
      });
    });
  });

  // inline rename on blur
  tree.querySelectorAll(".treeInput").forEach((inp) => {
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("blur", async () => {
      const level = inp.dataset.level;
      const name = inp.value.trim();
      if (!name) {
        // revert
        await reloadDb();
        renderAll();
        return;
      }
      try {
        if (level === "bank") {
          await api.put(`/api/banks/${encodeURIComponent(inp.dataset.bankId)}`, { name });
        } else if (level === "chapter") {
          await api.put(
            `/api/banks/${encodeURIComponent(inp.dataset.bankId)}/chapters/${encodeURIComponent(inp.dataset.chapterId)}`,
            { name }
          );
        } else if (level === "question") {
          await updateQuestionTitle(inp.dataset.questionId, name);
        }
        await reloadDb();
        renderAll();
      } catch (e) {
        alert(`保存失败：${e.message}`);
      }
    });
  });

  // add/delete buttons
  tree.querySelectorAll(".miniBtn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const bankId = btn.closest(".treeNode")?.dataset.bankId;
      const chapterId = btn.closest(".treeNode")?.dataset.chapterId;
      const questionId = btn.closest(".treeNode")?.dataset.questionId;
      try {
        if (action === "addChapter") await addChapter(bankId);
        else if (action === "addQuestion") await addQuestion(bankId, chapterId);
        else if (action === "delBank") await deleteBank(bankId);
        else if (action === "delChapter") await deleteChapter(bankId, chapterId);
        else if (action === "delQuestion") await deleteQuestion(questionId);
      } catch (err) {
        alert(`操作失败：${err.message}`);
      }
    });
  });

  // post-render focus
  if (state.focusAfterRender) {
    const sel = state.focusAfterRender;
    state.focusAfterRender = null;
    const el = tree.querySelector(sel);
    if (el) {
      el.focus();
      el.select?.();
    }
  }
}

function renderAll() {
  renderTree();
  renderScopeHint();
}

async function addBank() {
  const b = await api.post("/api/banks", { name: "新题库" });
  await reloadDb();
  state.selected.bankId = b.id;
  state.selected.chapterId = null;
  state.selected.questionId = null;
  state.focusAfterRender = `.treeInput[data-level="bank"][data-bank-id="${CSS.escape(b.id)}"]`;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function addChapter(bankId) {
  const bid = bankId || state.selected.bankId;
  if (!bid) return alert("请先选择题库。");
  const c = await api.post("/api/chapters", { bankId: bid, name: "新章节" });
  await reloadDb();
  state.selected.bankId = bid;
  state.selected.chapterId = c.id;
  state.selected.questionId = null;
  state.focusAfterRender = `.treeInput[data-level="chapter"][data-bank-id="${CSS.escape(bid)}"][data-chapter-id="${CSS.escape(c.id)}"]`;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function deleteBank(bankId) {
  if (!bankId) return;
  if (!confirm("删除题库将删除其下全部章节/题目，确认？")) return;
  await api.del(`/api/banks/${encodeURIComponent(bankId)}`);
  await reloadDb();
  if (state.selected.bankId === bankId) state.selected = { bankId: null, chapterId: null, questionId: null };
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function deleteChapter(bankId, chapterId) {
  if (!bankId || !chapterId) return;
  if (!confirm("删除章节将删除其下全部题目，确认？")) return;
  await api.del(`/api/banks/${encodeURIComponent(bankId)}/chapters/${encodeURIComponent(chapterId)}`);
  await reloadDb();
  if (state.selected.chapterId === chapterId) state.selected.chapterId = null;
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function addQuestion(bankId, chapterId) {
  const bid = bankId || state.selected.bankId;
  const cid = chapterId || state.selected.chapterId;
  if (!bid || !cid) return alert("请先选择到具体章节。");
  const r = await api.post(`/api/banks/${encodeURIComponent(bid)}/chapters/${encodeURIComponent(cid)}/questions`, {
    title: "新题目",
    content: ""
  });
  await reloadDb();
  const chap = (state.db?.banks || [])
    .filter(Boolean)
    .find((b) => b.id === bid)
    ?.chapters?.filter(Boolean)
    ?.find((c) => c.id === cid);
  const lastId = chap?.questions?.length ? chap.questions[chap.questions.length - 1].id : null;
  state.selected.bankId = bid;
  state.selected.chapterId = cid;
  state.selected.questionId = lastId;
  if (lastId) state.focusAfterRender = `.treeInput[data-level="question"][data-question-id="${CSS.escape(lastId)}"]`;
  syncEditorFromSelectedQuestion();
  renderAll();
  return r;
}

function newQuestion() {
  const chap = selectedChapter();
  if (!chap) return alert("请先选择到具体章节。");
  addQuestion(state.selected.bankId, chap.id);
}

async function updateQuestionTitle(questionId, newTitle) {
  const qid = String(questionId || "");
  if (!qid) return;
  // 保持内容不丢失：用当前 DB 里的内容回填
  const q = (state.db?.banks || [])
    .filter(Boolean)
    .flatMap((b) => (Array.isArray(b.chapters) ? b.chapters.filter(Boolean) : []))
    .flatMap((c) => (Array.isArray(c.questions) ? c.questions.filter(Boolean) : []))
    .find((x) => x.id === qid);
  const content = q?.content || "";
  await api.put(`/api/questions/${encodeURIComponent(qid)}`, { title: newTitle, content });
}

async function saveQuestionContentIfNeeded() {
  if (!state.dirty.content) return;
  const q = selectedQuestion();
  if (!q) return;
  const content = $("qContent").value;
  $("saveMsg").textContent = "保存中…";
  try {
    await api.put(`/api/questions/${encodeURIComponent(q.id)}`, { title: q.title, content });
    $("saveMsg").textContent = "已保存。";
    state.dirty.content = false;
    await reloadDb();
    // 保持选中
    renderAll();
    syncEditorFromSelectedQuestion();
  } catch (e) {
    $("saveMsg").textContent = `保存失败：${e.message}`;
  }
}

async function deleteQuestion(questionId) {
  if (!questionId) return;
  if (!confirm("确认删除该题目？")) return;
  await api.del(`/api/questions/${encodeURIComponent(questionId)}`);
  if (state.selected.questionId === questionId) state.selected.questionId = null;
  await reloadDb();
  ensureSelectionValid();
  syncEditorFromSelectedQuestion();
  renderAll();
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
  await api.post("/api/import", json);
  await reloadDb();
  state.selected = { bankId: null, chapterId: null, questionId: null };
  syncEditorFromSelectedQuestion();
  renderAll();
}

function bind() {
  $("addBankBtn").addEventListener("click", addBank);
  $("newQuestionBtn").addEventListener("click", newQuestion);
  $("deleteQuestionBtn").addEventListener("click", async () => {
    if (!state.selected.questionId) return;
    await deleteQuestion(state.selected.questionId);
  });

  $("qContent").addEventListener("input", () => {
    state.dirty.content = true;
    $("saveMsg").textContent = "未保存（失去焦点会保存）";
    const previewEl = $("qPreview");
    if (previewEl && window.renderMarkdown) previewEl.innerHTML = window.renderMarkdown($("qContent").value);
  });
  $("qContent").addEventListener("blur", () => {
    saveQuestionContentIfNeeded();
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
  bind();
  await reloadDb();
  ensureSelectionValid();
  renderAll();
  syncEditorFromSelectedQuestion();
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

