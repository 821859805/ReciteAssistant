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
  selected: { bankId: null, chapterId: null, sectionId: null, questionId: null }
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
function selectedSection() {
  const c = selectedChapter();
  return c ? (c.sections || []).find((s) => s.id === state.selected.sectionId) || null : null;
}
function selectedQuestion() {
  const s = selectedSection();
  return s ? (s.questions || []).find((q) => q.id === state.selected.questionId) || null : null;
}

async function reloadDb() {
  state.db = await api.get("/api/db");
}

function renderList(container, items, { selectedId, onSelect, onRename, onDelete, emptyText }) {
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="muted">${escapeHtml(emptyText || "暂无")}</div>`;
    return;
  }
  container.innerHTML = items
    .map((it) => {
      const isSel = it.id === selectedId;
      return `
        <div class="item ${isSel ? "active" : ""}" data-id="${escapeHtml(it.id)}">
          <div class="itemMain">
            <div class="itemTitle">${escapeHtml(it.name || it.title || "")}</div>
            <div class="itemMeta muted">${escapeHtml(it.id)}</div>
          </div>
          <div class="itemBtns">
            <button class="miniBtn rename">改名</button>
            <button class="miniBtn danger del">删</button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".item").forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener("click", (e) => {
      if (e.target.classList.contains("rename") || e.target.classList.contains("del")) return;
      onSelect?.(id);
    });
    el.querySelector(".rename").addEventListener("click", async (e) => {
      e.stopPropagation();
      await onRename?.(id);
    });
    el.querySelector(".del").addEventListener("click", async (e) => {
      e.stopPropagation();
      await onDelete?.(id);
    });
  });
}

function renderQuestions() {
  const sec = selectedSection();
  const list = $("questionsList");
  const items = sec?.questions || [];
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
      state.selected.questionId = id;
      syncEditorFromSelectedQuestion();
      renderAll();
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
  $("saveMsg").textContent = q ? "" : "可直接填写并点击“保存”创建新题。";
}

function renderScopeHint() {
  const b = selectedBank();
  const c = selectedChapter();
  const s = selectedSection();
  const parts = [b ? b.name : "未选题库", c ? c.name : "未选章节", s ? s.name : "未选小节"];
  $("scopeHint").textContent = `当前：${parts.join(" / ")}`;
}

function renderAll() {
  const banks = state.db?.banks || [];
  renderList($("banksList"), banks, {
    selectedId: state.selected.bankId,
    emptyText: "暂无题库，请先新增",
    onSelect: (id) => {
      state.selected.bankId = id;
      state.selected.chapterId = null;
      state.selected.sectionId = null;
      state.selected.questionId = null;
      syncEditorFromSelectedQuestion();
      renderAll();
    },
    onRename: async (id) => {
      const b = banks.find((x) => x.id === id);
      const name = prompt("题库名称：", b?.name || "");
      if (!name) return;
      await api.put(`/api/banks/${encodeURIComponent(id)}`, { name });
      await reloadDb();
      renderAll();
    },
    onDelete: async (id) => {
      if (!confirm("删除题库将删除其下全部章节/小节/题目，确认？")) return;
      await api.del(`/api/banks/${encodeURIComponent(id)}`);
      if (state.selected.bankId === id) state.selected = { bankId: null, chapterId: null, sectionId: null, questionId: null };
      await reloadDb();
      syncEditorFromSelectedQuestion();
      renderAll();
    }
  });

  const bank = selectedBank();
  const chapters = bank?.chapters || [];
  renderList($("chaptersList"), chapters, {
    selectedId: state.selected.chapterId,
    emptyText: bank ? "暂无章节，请新增" : "请先选择题库",
    onSelect: (id) => {
      state.selected.chapterId = id;
      state.selected.sectionId = null;
      state.selected.questionId = null;
      syncEditorFromSelectedQuestion();
      renderAll();
    },
    onRename: async (id) => {
      if (!bank) return;
      const c = chapters.find((x) => x.id === id);
      const name = prompt("章节名称：", c?.name || "");
      if (!name) return;
      await api.put(`/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(id)}`, { name });
      await reloadDb();
      renderAll();
    },
    onDelete: async (id) => {
      if (!bank) return;
      if (!confirm("删除章节将删除其下全部小节/题目，确认？")) return;
      await api.del(`/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(id)}`);
      if (state.selected.chapterId === id) {
        state.selected.chapterId = null;
        state.selected.sectionId = null;
        state.selected.questionId = null;
      }
      await reloadDb();
      syncEditorFromSelectedQuestion();
      renderAll();
    }
  });

  const chapter = selectedChapter();
  const sections = chapter?.sections || [];
  renderList($("sectionsList"), sections, {
    selectedId: state.selected.sectionId,
    emptyText: chapter ? "暂无小节，请新增" : "请先选择章节",
    onSelect: (id) => {
      state.selected.sectionId = id;
      state.selected.questionId = null;
      syncEditorFromSelectedQuestion();
      renderAll();
    },
    onRename: async (id) => {
      if (!bank || !chapter) return;
      const s = sections.find((x) => x.id === id);
      const name = prompt("小节名称：", s?.name || "");
      if (!name) return;
      await api.put(
        `/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(chapter.id)}/sections/${encodeURIComponent(id)}`,
        { name }
      );
      await reloadDb();
      renderAll();
    },
    onDelete: async (id) => {
      if (!bank || !chapter) return;
      if (!confirm("删除小节将删除其下全部题目，确认？")) return;
      await api.del(`/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(chapter.id)}/sections/${encodeURIComponent(id)}`);
      if (state.selected.sectionId === id) {
        state.selected.sectionId = null;
        state.selected.questionId = null;
      }
      await reloadDb();
      syncEditorFromSelectedQuestion();
      renderAll();
    }
  });

  renderScopeHint();
  renderQuestions();
}

async function addBank() {
  const name = prompt("题库名称：", "Java");
  if (!name) return;
  const b = await api.post("/api/banks", { name });
  await reloadDb();
  state.selected.bankId = b.id;
  state.selected.chapterId = null;
  state.selected.sectionId = null;
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function addChapter() {
  const bank = selectedBank();
  if (!bank) return alert("请先选择题库。");
  const name = prompt("章节名称：", "基础");
  if (!name) return;
  const c = await api.post("/api/chapters", { bankId: bank.id, name });
  await reloadDb();
  state.selected.chapterId = c.id;
  state.selected.sectionId = null;
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function addSection() {
  const bank = selectedBank();
  const chapter = selectedChapter();
  if (!bank || !chapter) return alert("请先选择题库和章节。");
  const name = prompt("小节名称：", "概念");
  if (!name) return;
  const s = await api.post("/api/sections", { bankId: bank.id, chapterId: chapter.id, name });
  await reloadDb();
  state.selected.sectionId = s.id;
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
}

function newQuestion() {
  if (!selectedSection()) return alert("请先选择到具体小节。");
  state.selected.questionId = null;
  syncEditorFromSelectedQuestion();
  renderAll();
}

async function saveQuestion() {
  const bank = selectedBank();
  const chapter = selectedChapter();
  const section = selectedSection();
  if (!bank || !chapter || !section) return alert("请先选择到具体小节。");

  const title = $("qTitle").value.trim();
  const content = $("qContent").value;
  if (!title) return alert("题目标题不能为空。");

  $("saveMsg").textContent = "保存中…";
  try {
    const qid = state.selected.questionId;
    if (qid) {
      await api.put(`/api/questions/${encodeURIComponent(qid)}`, { title, content });
      $("saveMsg").textContent = "已保存。";
    } else {
      const r = await api.post(
        `/api/banks/${encodeURIComponent(bank.id)}/chapters/${encodeURIComponent(chapter.id)}/sections/${encodeURIComponent(section.id)}/questions`,
        { title, content }
      );
      $("saveMsg").textContent = `已创建（新增 ${r.inserted || 0} 题）。`;
    }
    await reloadDb();
    // 自动选中新创建/更新的题（新建时选最后一个）
    const sec = selectedSection();
    if (!state.selected.questionId && sec?.questions?.length) state.selected.questionId = sec.questions[sec.questions.length - 1].id;
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
  state.selected = { bankId: null, chapterId: null, sectionId: null, questionId: null };
  syncEditorFromSelectedQuestion();
  renderAll();
}

function bind() {
  $("addBankBtn").addEventListener("click", addBank);
  $("addChapterBtn").addEventListener("click", addChapter);
  $("addSectionBtn").addEventListener("click", addSection);
  $("newQuestionBtn").addEventListener("click", newQuestion);
  $("saveQuestionBtn").addEventListener("click", saveQuestion);
  $("deleteQuestionBtn").addEventListener("click", async () => {
    if (!state.selected.questionId) return;
    await deleteQuestion(state.selected.questionId);
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

