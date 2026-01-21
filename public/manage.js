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
  dirty: { title: false, content: false }
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
  if (!state.dirty.title && !state.dirty.content) return;
  await saveQuestionIfNeeded();
}

function renderQuestions() {
  const chap = selectedChapter();
  const list = $("questionsList");
  const items = chap?.questions || [];
  const selectedId = state.selected.questionId;
  if (items.length === 0) {
    list.innerHTML = `<div class="muted">暂无题目</div>`;
    return;
  }
  list.innerHTML = items
    .map((q) => {
      const isSel = q.id === selectedId;
      const meta = q.srs?.lastReviewedAt ? `上次：${new Date(q.srs.lastReviewedAt).toLocaleString()}` : "未学习";
      return `
        <div class="item ${isSel ? "active" : ""}" data-id="${escapeHtml(q.id)}">
          <div class="itemMain">
            <div class="itemTitle">${escapeHtml(q.title)}</div>
            <div class="itemMeta muted">${escapeHtml(meta)}</div>
          </div>
          <div class="itemBtns">
            <button class="miniBtn danger del">删</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".item").forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("del")) return;
      safeBlurSaveQuestion().finally(() => {
        state.selected.questionId = id;
        syncEditorFromSelectedQuestion();
        renderAll();
      });
    });
    el.querySelector(".del").addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteQuestion(id);
    });
  });
}

function syncEditorFromSelectedQuestion() {
  const q = selectedQuestion();
  $("qTitle").value = q ? q.title : "";
  $("qContent").value = q ? q.content : "";
  state.dirty.title = false;
  state.dirty.content = false;
  $("saveMsg").textContent = q ? "" : "可直接填写标题/内容，失去焦点会创建新题。";
}

function renderScopeHint() {
  $("scopeHint").textContent = `当前：${currentScopeText()}`;
}

function renderTree() {
  const tree = $("tree");
  const banks = state.db?.banks || [];
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

    for (const c of b.chapters || []) {
      const chapActive = bankActive && state.selected.chapterId === c.id;
      html.push(`
        <div class="treeNode ${chapActive ? "active" : ""}" data-level="chapter" data-bank-id="${escapeHtml(b.id)}" data-chapter-id="${escapeHtml(c.id)}">
          <div class="treeRow indent1">
            <span class="treeDot l2"></span>
            <input class="treeInput" data-level="chapter" data-bank-id="${escapeHtml(b.id)}" data-chapter-id="${escapeHtml(c.id)}" value="${escapeHtml(
        c.name
      )}" />
            <div class="treeBtns">
              <button class="miniBtn danger del" data-action="delChapter" title="删除章节">删</button>
            </div>
          </div>
        </div>
      `);
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
      safeBlurSaveQuestion().finally(() => {
        state.selected.bankId = bankId || null;
        state.selected.chapterId = level === "bank" ? null : chapterId;
        state.selected.questionId = null;
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
      try {
        if (action === "addChapter") await addChapter(bankId);
        else if (action === "delBank") await deleteBank(bankId);
        else if (action === "delChapter") await deleteChapter(bankId, chapterId);
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
  renderQuestions();
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

function newQuestion() {
  if (!selectedChapter()) return alert("请先选择到具体章节。");
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
  $("qTitle").focus();
}

async function saveQuestionIfNeeded() {
  const bank = selectedBank();
  const chapter = selectedChapter();
  if (!bank || !chapter) return;

  const title = $("qTitle").value.trim();
  const content = $("qContent").value;
  if (!title) {
    $("saveMsg").textContent = "标题为空，未保存。";
    state.dirty.title = false;
    state.dirty.content = false;
    return;
  }

  $("saveMsg").textContent = "保存中…";
  try {
    const qid = state.selected.questionId;
    if (qid) {
      await api.put(`/api/questions/${encodeURIComponent(qid)}`, { title, content });
      $("saveMsg").textContent = "已保存。";
    } else {
      const r = await api.post(`/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(chapter.id)}/questions`, { title, content });
      $("saveMsg").textContent = `已创建（新增 ${r.inserted || 0} 题）。`;
    }
    await reloadDb();
    // 自动选中新创建/更新的题（新建时选最后一个）
    const chap = selectedChapter();
    if (!state.selected.questionId && chap?.questions?.length) state.selected.questionId = chap.questions[chap.questions.length - 1].id;
    state.dirty.title = false;
    state.dirty.content = false;
    renderAll();
  } catch (e) {
    $("saveMsg").textContent = `保存失败：${e.message}`;
  }
}

async function deleteQuestion(questionId) {
  if (!confirm("确认删除该题目？")) return;
  await api.del(`/api/questions/${encodeURIComponent(questionId)}`);
  if (state.selected.questionId === questionId) state.selected.questionId = null;
  await reloadDb();
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

  $("qTitle").addEventListener("input", () => {
    state.dirty.title = true;
    $("saveMsg").textContent = "未保存（失去焦点会保存）";
  });
  $("qContent").addEventListener("input", () => {
    state.dirty.content = true;
    $("saveMsg").textContent = "未保存（失去焦点会保存）";
  });
  $("qTitle").addEventListener("blur", () => {
    saveQuestionIfNeeded();
  });
  $("qContent").addEventListener("blur", () => {
    saveQuestionIfNeeded();
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
  renderAll();
  syncEditorFromSelectedQuestion();
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

