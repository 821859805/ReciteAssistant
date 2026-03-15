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
  dirty: { content: false },
  collapsedChapters: new Set() // 存储折叠的章节ID
};

function countChars(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function countBankStats(bank) {
  let totalQuestions = 0;
  let learnedQuestions = 0;
  let reviewedQuestions = 0; // 状态2及以上（已二刷）
  let totalChars = 0;

  for (const chapter of bank.chapters || []) {
    for (const question of chapter.questions || []) {
      totalQuestions++;
      totalChars += countChars(question.content);

      const state = question.srs?.state || 0;
      // 状态 >= 1 表示已学习过
      if (state >= 1) {
        learnedQuestions++;
      }
      // 状态 >= 2 表示已二刷
      if (state >= 2) {
        reviewedQuestions++;
      }
    }
  }

  return { totalQuestions, learnedQuestions, reviewedQuestions, totalChars };
}

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
  const titleHint = $("questionTitleHint");
  const previewEl = $("qPreview");
  const stateSelect = $("stateSelect");
  const resetStateBtn = $("resetStateBtn");
  const charCountHint = $("charCountHint");

  if (!contentEl || !titleHint || !previewEl) {
    return;
  }

  if (!q) {
    contentEl.value = "";
    contentEl.disabled = true;
    titleHint.textContent = "未选中题目（请在左侧选择题目）";
    previewEl.innerHTML = `<div class="muted">未选中题目</div>`;
    if (charCountHint) charCountHint.textContent = "字数：-";
    if (stateSelect) { stateSelect.value = "0"; stateSelect.disabled = true; }
    if (resetStateBtn) resetStateBtn.disabled = true;
    const saveMsg = $("saveMsg");
    if (saveMsg) saveMsg.textContent = "";
    state.dirty.content = false;
    return;
  }

  contentEl.disabled = false;
  contentEl.value = q.content || "";
  titleHint.textContent = `当前题目：${q.title}`;
  if (charCountHint) charCountHint.textContent = `字数：题目 ${countChars(q.title)} · 答案 ${countChars(q.content)}`;
  previewEl.innerHTML = window.renderMarkdown ? window.renderMarkdown(q.content || "") : escapeHtml(q.content || "");
  if (window.applyHighlight) window.applyHighlight(previewEl);
  else {
    window.__hljsPending = window.__hljsPending || [];
    window.__hljsPending.push(previewEl);
  }

  const qState = q.srs?.state || 0;
  if (stateSelect) { stateSelect.value = String(qState); stateSelect.disabled = false; }
  if (resetStateBtn) resetStateBtn.disabled = qState === 0;

  state.dirty.content = false;
  const saveMsg = $("saveMsg");
  if (saveMsg) saveMsg.textContent = "";
}

// function renderScopeHint() {
//   $("scopeHint").textContent = `当前：${currentScopeText()}`;
// }

function renderTree() {
  const tree = $("tree");
  if (!tree) return;

  // 获取当前选中的题库
  const bank = selectedBank();
  if (!bank) {
    tree.innerHTML = `<div class="muted">请先选择一个题库</div>`;
    return;
  }

  const chapters = (Array.isArray(bank.chapters) ? bank.chapters : []).filter(Boolean);

  if (chapters.length === 0) {
    tree.innerHTML = `<div class="muted">暂无章节，请点击"+ 章节"添加</div>`;
    return;
  }

  const html = [];
  for (const c of chapters) {
    const chapActive = state.selected.chapterId === c.id;
    const isCollapsed = state.collapsedChapters.has(c.id);
    const questions = (Array.isArray(c.questions) ? c.questions : []).filter(Boolean);
    const questionCount = questions.length;
    
    html.push(`
      <div class="treeNode ${chapActive ? "active" : ""}" data-level="chapter" data-bank-id="${escapeHtml(bank.id)}" data-chapter-id="${escapeHtml(c.id)}" draggable="true">
        <div class="treeRow">
          <button class="treeToggle" data-action="toggleChapter" data-chapter-id="${escapeHtml(c.id)}" title="${isCollapsed ? "展开" : "折叠"}">
            <span class="treeToggleIcon ${isCollapsed ? "collapsed" : ""}">▶</span>
          </button>
          <span class="treeDot l2"></span>
          <input class="treeInput" data-level="chapter" data-bank-id="${escapeHtml(bank.id)}" data-chapter-id="${escapeHtml(c.id)}" value="${escapeHtml(c.name)}" />
          <div class="treeMeta muted" style="font-size: 11px;">${questionCount} 题</div>
          <div class="treeBtns">
            <button class="miniBtn add" data-action="addQuestion" title="新增题目">+题</button>
            <button class="miniBtn danger del" data-action="delChapter" title="删除章节">删</button>
          </div>
        </div>
      </div>
    `);

    // questions under chapter - 只在未折叠时显示
    if (!isCollapsed) {
      for (const q of questions) {
        const qActive = chapActive && state.selected.questionId === q.id;
        const qState = q.srs?.state || 0;
        const meta = q.srs?.lastReviewedAt
          ? `Lv${qState} · ${new Date(q.srs.lastReviewedAt).toLocaleDateString()}`
          : `Lv${qState}`;
        html.push(`
          <div class="treeNode ${qActive ? "active" : ""} treeNodeChild" data-level="question" data-bank-id="${escapeHtml(bank.id)}" data-chapter-id="${escapeHtml(c.id)}" data-question-id="${escapeHtml(q.id)}" draggable="true">
            <div class="treeRow indent1">
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

function renderBanksView() {
  const container = $("mainContainer");
  const banks = state.db?.banks || [];

  const html = `
    <div class="banksGrid">
      <div class="panel" style="grid-column: 1 / -1;">
        <div class="panelTitle">题库管理</div>
        <div class="row">
          <button id="addBankBtn" class="btn primary">+ 新建题库</button>
          <div class="muted">点击题库卡片进入管理</div>
        </div>
      </div>
      <div class="banksContainer">
        ${banks.map(bank => {
          const stats = countBankStats(bank);
          const learnedPercent = stats.totalQuestions > 0 ? (stats.learnedQuestions / stats.totalQuestions) * 100 : 0;
          const reviewedPercent = stats.totalQuestions > 0 ? (stats.reviewedQuestions / stats.totalQuestions) * 100 : 0;

          return `
            <div class="bankCard" data-bank-id="${escapeHtml(bank.id)}">
              <div class="bankCardTitle">
                <span class="bankCardName" data-bank-id="${escapeHtml(bank.id)}" title="双击编辑名称">${escapeHtml(bank.name)}</span>
                <button class="bankCardDeleteBtn" data-action="deleteBank" data-bank-id="${escapeHtml(bank.id)}" title="删除题库">×</button>
              </div>

              <div class="bankCardStats">
                <div class="statItem">
                  <span class="statValue">${stats.totalChars.toLocaleString()}</span>
                  <div class="statLabel">总字数</div>
                </div>
                <div class="statItem">
                  <span class="statValue">${stats.learnedQuestions}/${stats.totalQuestions}</span>
                  <div class="statLabel">学习进度</div>
                </div>
              </div>

              <div class="progressBar">
                <div class="progressFill" style="width: ${learnedPercent}%"></div>
              </div>
              <div class="progressText">${Math.round(learnedPercent)}% 已学习</div>

              <div style="margin-top: 8px;">
                <div class="progressBar" style="height: 6px;">
                  <div class="progressFill" style="width: ${reviewedPercent}%; background: linear-gradient(90deg, var(--primary2), var(--ok));"></div>
                </div>
                <div class="progressText" style="font-size: 11px; margin-top: 4px;">${Math.round(reviewedPercent)}% 已二刷 (${stats.reviewedQuestions}/${stats.totalQuestions})</div>
              </div>

              <div class="bankCardMeta">
                <span>${bank.chapters?.length || 0} 个章节</span>
                <span>${new Date(bank.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  container.innerHTML = html;

  // 重新绑定事件
  bindBankViewEvents();
}

function renderManageView() {
  const container = $("mainContainer");

  const html = `
    <main class="layout full">
      <aside class="sidebar">
        <div class="panel">
          <div class="panelTitle">
            <div class="row" style="justify-content: space-between; align-items: center;">
              <span>目录（三级：题库 / 章节 / 题目）</span>
              <button id="backToBanksBtn" class="btn secondary mini">← 返回题库</button>
            </div>
          </div>
          <div class="row">
            <button id="addChapterBtn" class="btn secondary">+ 章节</button>
            <div class="muted">可拖拽排序，失去焦点自动保存</div>
          </div>
          <div id="tree" class="tree"></div>
        </div>
      </aside>

      <section class="content">
        <div class="panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="panelTitle" id="questionTitleHint" style="margin: 0; font-size: 16px;">未选中题目</div>
          </div>
          <div class="editor" style="flex: 1; display: flex; flex-direction: column;">
            <div class="row" style="margin-bottom: 12px; align-items: center; justify-content: space-between;">
              <div class="row" style="align-items: center; gap: 8px;">
                <span class="muted" style="font-size: 12px; font-weight: 500;">熟练度:</span>
                <select id="stateSelect" style="width: auto; min-width: 120px; padding: 4px 8px; font-size: 12px; height: 28px; background-color: var(--panel2); border-color: var(--border);">
                  <option value="0">Lv0 - 新题</option>
                  <option value="1">Lv1 - 学习一遍</option>
                  <option value="2">Lv2 - 学习两遍</option>
                  <option value="3">Lv3 - 初步掌握</option>
                  <option value="4">Lv4 - 基本掌握</option>
                  <option value="5">Lv5 - 熟练掌握</option>
                  <option value="6">Lv6 - 完全掌握</option>
                </select>
                <button id="resetStateBtn" class="btn secondary" style="padding: 4px 10px; font-size: 12px; height: 28px; line-height: 1;">重置</button>
              </div>
              <div class="muted" style="font-size: 11px; opacity: 0.8;">
                快捷键：<b>Ctrl/⌘+B</b> 粗体，<b>Ctrl/⌘+I</b> 斜体，<b>Ctrl/⌘+K</b> 链接，<b>Ctrl/⌘+\`</b> 行内代码，<b>Ctrl/⌘+Shift+C</b> 代码块
              </div>
            </div>
            <div class="field" style="flex: 1; display: flex; flex-direction: column; margin-bottom: 0;">
              <div class="mdSplit" style="flex: 1;">
                <div class="mdPane" style="display: flex; flex-direction: column;">
                  <div class="mdPaneTitle" style="padding: 4px 8px; font-size: 11px; background: var(--panel2); border-bottom: 1px solid var(--border);">编辑区</div>
                  <textarea id="qContent" class="mdEditor" placeholder="先在左侧选中某个题目，然后在这里用 Markdown 编辑答案内容" style="flex: 1; border: none; border-radius: 0;"></textarea>
                </div>
                <div class="mdPane" style="display: flex; flex-direction: column;">
                  <div class="mdPaneTitle" style="padding: 4px 8px; font-size: 11px; background: var(--panel2); border-bottom: 1px solid var(--border);">预览区</div>
                  <div id="qPreview" class="mdPreview" style="flex: 1; overflow-y: auto;">未选中题目</div>
                </div>
              </div>
            </div>
            <div class="row" style="justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
              <div class="row" style="gap: 12px; align-items: center;">
                <div class="muted" id="charCountHint" style="font-size: 11px;">字数：-</div>
              </div>
              <div class="muted" id="saveMsg" style="font-size: 11px; color: var(--primary);"></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;

  container.innerHTML = html;

  // 重新绑定事件
  bindManageViewEvents();
}

function bindBankViewEvents() {
  // 题库卡片点击事件
  const cards = document.querySelectorAll(".bankCard");
  cards.forEach(card => {
    card.addEventListener("click", (e) => {
      // 如果点击的是删除按钮或名称编辑输入框，不触发进入管理
      // 注意：名称元素（bankCardName）的点击事件已经在 bindBankNameEditEvents 中阻止了传播
      if (e.target.classList.contains("bankCardDeleteBtn") || 
          e.target.classList.contains("bankCardNameInput")) {
        return;
      }
      const bankId = card.dataset.bankId;
      enterBankManagement(bankId);
    });
  });

  // 新建题库按钮
  const addBankBtn = $("addBankBtn");
  if (addBankBtn) {
    addBankBtn.addEventListener("click", addBank);
  }

  // 删除题库按钮
  const deleteBtns = document.querySelectorAll(".bankCardDeleteBtn");
  deleteBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const bankId = btn.dataset.bankId;
      if (bankId) {
        try {
          await deleteBank(bankId);
        } catch (err) {
          alert(`删除失败：${err.message}`);
        }
      }
    });
  });

  // 题库名称双击编辑
  bindBankNameEditEvents();
}

function bindBankNameEditEvents() {
  const bankNames = document.querySelectorAll(".bankCardName");
  bankNames.forEach(nameEl => {
    // 阻止点击事件传播，避免触发卡片点击进入管理
    nameEl.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    
    nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const bankId = nameEl.dataset.bankId;
      if (!bankId) return;
      
      const currentName = nameEl.textContent;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "bankCardNameInput";
      input.value = currentName;
      input.style.cssText = "flex: 1; padding: 4px 8px; border: 1px solid var(--primary); border-radius: 4px; font-size: 18px; font-weight: 700;";
      
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      
      const restoreNameEl = (text) => {
        const newSpan = document.createElement("span");
        newSpan.className = "bankCardName";
        newSpan.dataset.bankId = bankId;
        newSpan.textContent = text;
        newSpan.title = "双击编辑名称";
        input.replaceWith(newSpan);
        // 重新绑定事件
        bindBankNameEditEvents();
      };
      
      const saveName = async () => {
        const newName = input.value.trim();
        if (!newName) {
          // 如果名称为空，恢复原名称
          restoreNameEl(currentName);
          return;
        }
        
        if (newName === currentName) {
          // 名称未改变，直接恢复
          restoreNameEl(currentName);
          return;
        }
        
        try {
          await api.put(`/api/banks/${encodeURIComponent(bankId)}`, { name: newName });
          await reloadDb();
          renderBanksView(); // 重新渲染视图以更新名称
        } catch (err) {
          alert(`保存失败：${err.message}`);
          restoreNameEl(currentName);
        }
      };
      
      input.addEventListener("blur", saveName);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          restoreNameEl(currentName);
        }
      });
    });
  });
}

function bindTreeEvents() {
  const tree = $("tree");
  if (!tree) return;

  // drag and drop
  let draggedNode = null;

  tree.addEventListener("dragstart", (e) => {
    const node = e.target.closest(".treeNode");
    if (!node) return;
    draggedNode = node;
    node.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    // 设置半透明的拖拽图像
    e.dataTransfer.setData("text/plain", node.dataset.level);
  });

  tree.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggedNode) return;
    
    const targetNode = e.target.closest(".treeNode");
    if (!targetNode || targetNode === draggedNode) return;

    // 只能同级拖拽（章节拖到章节，题目拖到同章节的题目）
    if (draggedNode.dataset.level !== targetNode.dataset.level) return;
    if (draggedNode.dataset.level === "question" && draggedNode.dataset.chapterId !== targetNode.dataset.chapterId) return;

    const rect = targetNode.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    
    tree.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    });

    if (e.clientY < midY) {
      targetNode.classList.add("drag-over-top");
    } else {
      targetNode.classList.add("drag-over-bottom");
    }
  });

  tree.addEventListener("dragleave", (e) => {
    const targetNode = e.target.closest(".treeNode");
    if (targetNode) {
      targetNode.classList.remove("drag-over-top", "drag-over-bottom");
    }
  });

  tree.addEventListener("dragend", () => {
    if (draggedNode) {
      draggedNode.classList.remove("dragging");
    }
    tree.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    });
    draggedNode = null;
  });

  tree.addEventListener("drop", async (e) => {
    e.preventDefault();
    if (!draggedNode) return;

    const targetNode = e.target.closest(".treeNode");
    tree.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
      el.classList.remove("drag-over-top", "drag-over-bottom");
    });

    if (!targetNode || targetNode === draggedNode) return;
    if (draggedNode.dataset.level !== targetNode.dataset.level) return;
    if (draggedNode.dataset.level === "question" && draggedNode.dataset.chapterId !== targetNode.dataset.chapterId) return;

    const rect = targetNode.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midY;

    const level = draggedNode.dataset.level;
    const bankId = draggedNode.dataset.bankId;
    const chapterId = draggedNode.dataset.chapterId;
    
    const draggedId = level === "chapter" ? chapterId : draggedNode.dataset.questionId;
    const targetId = level === "chapter" ? targetNode.dataset.chapterId : targetNode.dataset.questionId;

    await handleDragReorder(level, bankId, chapterId, draggedId, targetId, insertAfter);
  });

  // selection click
  tree.querySelectorAll(".treeNode").forEach((node) => {
    node.addEventListener("click", (e) => {
      const t = e.target;
      if (t.classList && (t.classList.contains("treeInput") || t.classList.contains("miniBtn") || t.classList.contains("sortBtn") || t.classList.contains("treeToggle") || t.closest(".treeToggle"))) return;
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

  // toggle chapter collapse/expand
  tree.querySelectorAll(".treeToggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const chapterId = btn.dataset.chapterId;
      if (chapterId) {
        if (state.collapsedChapters.has(chapterId)) {
          state.collapsedChapters.delete(chapterId);
        } else {
          state.collapsedChapters.add(chapterId);
        }
        renderAll();
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

  // sort buttons (removed)
}

function bindManageViewEvents() {
  // 返回按钮
  const backBtn = $("backToBanksBtn");
  if (backBtn) {
    backBtn.addEventListener("click", exitBankManagement);
  }

  // 添加章节按钮
  const addChapterBtn = $("addChapterBtn");
  if (addChapterBtn) {
    addChapterBtn.addEventListener("click", () => addChapter(state.selected.bankId));
  }

  // 题目相关按钮
  // const newQuestionBtn = $("newQuestionBtn"); // 按钮已删除
  // if (newQuestionBtn) {
  //   newQuestionBtn.addEventListener("click", newQuestion);
  // }

  // 删除该题事件已移除

  // 编辑器事件
  const qContent = $("qContent");
  if (qContent) {
    qContent.addEventListener("input", () => {
      state.dirty.content = true;
      $("saveMsg").textContent = "未保存（失去焦点会保存）";
      const previewEl = $("qPreview");
      const charCountHint = $("charCountHint");
      const q = selectedQuestion();
      if (q) {
        if (charCountHint) charCountHint.textContent = `字数：题目 ${countChars(q.title)} · 答案 ${countChars($("qContent").value)}`;
      }
      if (previewEl && window.renderMarkdown) {
        previewEl.innerHTML = window.renderMarkdown($("qContent").value);
        if (window.applyHighlight) window.applyHighlight(previewEl);
        else {
          window.__hljsPending = window.__hljsPending || [];
          window.__hljsPending.push(previewEl);
        }
      }
    });

    qContent.addEventListener("keydown", (e) => {
      // Markdown shortcuts (Ctrl/⌘)
      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;
      const key = e.key;
      const el = e.target;
      
      if (!(el && typeof el.selectionStart === "number")) return;
  
      const withShift = e.shiftKey;
      const lower = String(key).toLowerCase();
  
      const applyWrap = (prefix, suffix, placeholder) => {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = el.value;
        const selected = value.slice(start, end) || placeholder || "";
        const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
        el.value = next;
        const cursorStart = start + prefix.length;
        const cursorEnd = cursorStart + selected.length;
        el.setSelectionRange(cursorStart, cursorEnd);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
  
      const applyLinePrefix = (linePrefix) => {
        const value = el.value;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = value.indexOf("\n", end);
        const endPos = lineEnd === -1 ? value.length : lineEnd;
        const block = value.slice(lineStart, endPos);
        const lines = block.split("\n").map((l) => (l.trim() ? linePrefix + l : l));
        const replaced = lines.join("\n");
        el.value = value.slice(0, lineStart) + replaced + value.slice(endPos);
        el.setSelectionRange(lineStart, lineStart + replaced.length);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
  
      // Ctrl/⌘+B bold
      if (!withShift && lower === "b") {
        e.preventDefault();
        applyWrap("**", "**", "加粗");
        return;
      }
      // Ctrl/⌘+I italic
      if (!withShift && lower === "i") {
        e.preventDefault();
        applyWrap("*", "*", "斜体");
        return;
      }
      // Ctrl/⌘+K link
      if (!withShift && lower === "k") {
        e.preventDefault();
        applyWrap("[", "](https://)", "链接文本");
        return;
      }
      // Ctrl/⌘+` inline code
      if (!withShift && key === "`") {
        e.preventDefault();
        applyWrap("`", "`", "code");
        return;
      }
      // Ctrl/⌘+Shift+L list
      if (withShift && lower === "l") {
        e.preventDefault();
        applyLinePrefix("- ");
        return;
      }
      // Ctrl/⌘+Shift+Q quote
      if (withShift && lower === "q") {
        e.preventDefault();
        applyLinePrefix("> ");
        return;
      }
      // Ctrl/⌘+Shift+C code block
      if (withShift && lower === "c") {
        e.preventDefault();
        applyWrap("\n```txt\n", "\n```\n", "代码");
        return;
      }
    });

    qContent.addEventListener("blur", () => {
      saveQuestionContentIfNeeded();
    });
  }

  // 熟练度管理
  const stateSelect = $("stateSelect");
  const resetStateBtn = $("resetStateBtn");

  if (stateSelect) {
    stateSelect.addEventListener("change", async (e) => {
      const st = Number(e.target.value);
      await updateQuestionState({ state: st });
    });
  }

  if (resetStateBtn) {
    resetStateBtn.addEventListener("click", async () => {
      if (!confirm("确认重置为 Lv0（未学习）？")) return;
      await updateQuestionState({ learned: false });
    });
  }
}

function bind() {
  // 全局事件绑定
}

function enterBankManagement(bankId) {
  state.selected.bankId = bankId;
  state.selected.chapterId = null;
  state.selected.questionId = null;

  // 切换到管理视图
  renderManageView();
  renderAll(); // 渲染目录树
  syncEditorFromSelectedQuestion();
}

function exitBankManagement() {
  state.selected = { bankId: null, chapterId: null, questionId: null };

  // 切换到卡片视图
  renderBanksView();
}

function renderAll() {
  renderTree();
  // renderScopeHint();

  // 重新绑定树的事件（因为树是动态生成的）
  bindTreeEvents();
}

async function addBank() {
  const name = prompt("请输入题库名称：", "新题库");
  if (!name || !name.trim()) {
    return; // 用户取消或输入为空
  }
  const b = await api.post("/api/banks", { name: name.trim() });
  await reloadDb();
  // 新建题库后保持在题库列表视图，不进入管理视图
  state.selected.bankId = null;
  state.selected.chapterId = null;
  state.selected.questionId = null;
  renderBanksView();
  syncEditorFromSelectedQuestion();
}

async function handleDragReorder(level, bankId, chapterId, draggedId, targetId, insertAfter) {
  const bank = (state.db.banks || []).find(b => b.id === bankId);
  if (!bank) return;

  if (level === "chapter") {
    const chapters = [...(bank.chapters || [])];
    const draggedIdx = chapters.findIndex(c => c.id === draggedId);
    const targetIdx = chapters.findIndex(c => c.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const [draggedItem] = chapters.splice(draggedIdx, 1);
    const newTargetIdx = chapters.findIndex(c => c.id === targetId);
    chapters.splice(insertAfter ? newTargetIdx + 1 : newTargetIdx, 0, draggedItem);

    try {
      await api.put(`/api/banks/${encodeURIComponent(bankId)}`, {
        chapters: chapters.map(c => ({ id: c.id }))
      });
      await reloadDb();
      renderAll();
    } catch (e) {
      alert("排序失败: " + e.message);
    }
  } else if (level === "question") {
    const chapter = (bank.chapters || []).find(c => c.id === chapterId);
    if (!chapter) return;

    const questions = [...(chapter.questions || [])];
    const draggedIdx = questions.findIndex(q => q.id === draggedId);
    const targetIdx = questions.findIndex(q => q.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const [draggedItem] = questions.splice(draggedIdx, 1);
    const newTargetIdx = questions.findIndex(q => q.id === targetId);
    questions.splice(insertAfter ? newTargetIdx + 1 : newTargetIdx, 0, draggedItem);

    try {
      await api.put(`/api/banks/${encodeURIComponent(bankId)}/chapters/${encodeURIComponent(chapterId)}`, {
        questions: questions.map(q => ({ id: q.id }))
      });
      await reloadDb();
      renderAll();
    } catch (e) {
      alert("排序失败: " + e.message);
    }
  }
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
  
  // 第一次确认
  if (!confirm("删除题库将删除其下全部章节/题目，确认删除？")) return;
  
  // 第二次确认
  if (!confirm("此操作不可恢复，请再次确认删除？")) return;
  
  await api.del(`/api/banks/${encodeURIComponent(bankId)}`);
  await reloadDb();
  if (state.selected.bankId === bankId) {
    state.selected = { bankId: null, chapterId: null, questionId: null };
    renderBanksView(); // 如果删除的是当前选中的题库，返回题库列表视图
  } else {
    renderBanksView(); // 刷新题库列表视图
  }
  syncEditorFromSelectedQuestion();
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
  state.collapsedChapters.delete(cid); // 确保新增题目时展开该章节
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


async function updateQuestionState(partial) {
  const q = selectedQuestion();
  if (!q) return;
  try {
    await api.put(`/api/questions/${encodeURIComponent(q.id)}/state`, partial);
    await reloadDb();
    ensureSelectionValid();
    renderAll();
    syncEditorFromSelectedQuestion();
  } catch (e) {
    alert(`更新记忆状态失败：${e.message}`);
  }
}

async function main() {
  await reloadDb();
  ensureSelectionValid();

  // 根据选择状态渲染相应的视图
  if (!state.selected.bankId) {
    renderBanksView();
  } else {
    renderManageView();
    renderAll();
    syncEditorFromSelectedQuestion();
  }
}

main().catch((e) => {
  console.error(e);
  alert(`启动失败：${e.message}`);
});

