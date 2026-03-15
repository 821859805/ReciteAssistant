/* 多语言代码编辑器 + 题目浏览 */
(function () {
  "use strict";

  // ========== DOM 引用 ==========
  const monacoContainer = document.getElementById("monacoContainer");
  const stdinInput = document.getElementById("stdinInput");
  const outputContent = document.getElementById("outputContent");
  const runBtn = document.getElementById("runBtn");
  const clearOutputBtn = document.getElementById("clearOutputBtn");
  const clearInputBtn = document.getElementById("clearInputBtn");
  const runMeta = document.getElementById("runMeta");
  const outputStatus = document.getElementById("outputStatus");
  const resizeHandle = document.getElementById("resizeHandle");
  const bottomPanels = document.getElementById("bottomPanels");
  const langSelect = document.getElementById("langSelect");

  // 题目面板 DOM
  const qpBankSelect = document.getElementById("qpBankSelect");
  const qpChapterSelect = document.getElementById("qpChapterSelect");
  const qpQuestionSelect = document.getElementById("qpQuestionSelect");
  const qpPrevBtn = document.getElementById("qpPrevBtn");
  const qpNextBtn = document.getElementById("qpNextBtn");
  const qpCounter = document.getElementById("qpCounter");
  const qpContent = document.getElementById("qpContent");
  const questionPanel = document.getElementById("questionPanel");
  const vResizeHandle = document.getElementById("vResizeHandle");

  // ========== 本地存储 key ==========
  const SK_CODE     = "editor_code";
  const SK_STDIN    = "editor_stdin";
  const SK_BOTTOM_H = "editor_bottom_h";
  const SK_PANEL_W  = "editor_panel_w";
  const SK_BANK     = "editor_bank";
  const SK_CHAPTER  = "editor_chapter";
  const SK_QUESTION = "editor_question";
  const SK_LANG     = "editor_lang";

  // ========== 语言配置 ==========
  const LANGS = {
    python:     { monacoId: "python",     label: "Python",     ext: ".py",  defaultCode: `# Python 代码\n\ndef solve():\n    n = int(input())\n    print(f"输入: {n}")\n\nif __name__ == "__main__":\n    solve()\n` },
    javascript: { monacoId: "javascript", label: "JavaScript", ext: ".js",  defaultCode: `// JavaScript (Node.js)\n\nconst readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\nconst lines = [];\n\nrl.on('line', l => lines.push(l));\nrl.on('close', () => {\n  const n = parseInt(lines[0] || '0');\n  console.log(\`输入: \${n}\`);\n});\n` },
    typescript: { monacoId: "typescript", label: "TypeScript", ext: ".ts",  defaultCode: `// TypeScript (tsx)\n\nconst n: number = 42;\nconsole.log(\`Hello TypeScript! n = \${n}\`);\n` },
    go:         { monacoId: "go",         label: "Go",         ext: ".go",  defaultCode: `package main\n\nimport (\n\t"fmt"\n)\n\nfunc main() {\n\tvar n int\n\tfmt.Scan(&n)\n\tfmt.Printf("输入: %d\\n", n)\n}\n` },
    java:       { monacoId: "java",       label: "Java",       ext: ".java",defaultCode: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        System.out.println("输入: " + n);\n    }\n}\n` },
    c:          { monacoId: "c",          label: "C",          ext: ".c",   defaultCode: `#include <stdio.h>\n\nint main() {\n    int n;\n    scanf("%d", &n);\n    printf("输入: %d\\n", n);\n    return 0;\n}\n` },
    cpp:        { monacoId: "cpp",        label: "C++",        ext: ".cpp", defaultCode: `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    cout << "输入: " << n << endl;\n    return 0;\n}\n` },
    rust:       { monacoId: "rust",       label: "Rust",       ext: ".rs",  defaultCode: `use std::io;\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_line(&mut input).unwrap();\n    let n: i32 = input.trim().parse().unwrap();\n    println!("输入: {}", n);\n}\n` },
    bash:       { monacoId: "shell",      label: "Bash",       ext: ".sh",  defaultCode: `#!/bin/bash\n# Bash 脚本\n\necho "当前工作目录: $(pwd)"\necho "文件列表:"\nls -la\n\n# 读取输入\nread -p "" name\necho "Hello, $name!"\n` },
    powershell: { monacoId: "powershell", label: "PowerShell", ext: ".ps1", defaultCode: `# PowerShell 脚本\n\nWrite-Host "当前工作目录: $(Get-Location)"\nWrite-Host "文件列表:"\nGet-ChildItem | Format-Table Name, Length, LastWriteTime\n\n# 读取输入\n$name = Read-Host\nWrite-Host "Hello, $name!"\n` }
  };

  let currentLang = safeGet(SK_LANG) || "python";
  if (!LANGS[currentLang]) currentLang = "python";
  langSelect.value = currentLang;

  // ========== 题目数据 ==========
  let db = null;
  let currentQuestions = [];
  let currentIdx = -1;

  // ========== 本地存储帮助 ==========
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); } catch (_) { /* */ }
  }

  // 每种语言独立保存代码
  function codeKey(lang) { return SK_CODE + "_" + lang; }
  function getSavedCode(lang) { return safeGet(codeKey(lang || currentLang)); }
  function saveCode(code) { safeSet(codeKey(currentLang), code); }
  function getSavedStdin() { return safeGet(SK_STDIN) || ""; }
  function saveStdin() { safeSet(SK_STDIN, stdinInput.value); }

  stdinInput.value = getSavedStdin();
  stdinInput.addEventListener("input", saveStdin);

  // ========== 题目浏览功能 ==========

  async function loadDb() {
    try {
      const resp = await fetch("/api/db");
      db = await resp.json();
      renderBankSelect();
    } catch (e) {
      console.error("加载题库失败:", e);
      qpBankSelect.innerHTML = '<option value="">加载失败</option>';
    }
  }

  function renderBankSelect() {
    if (!db || !db.banks) return;
    const saved = safeGet(SK_BANK);

    qpBankSelect.innerHTML = '<option value="">-- 题库 --</option>';
    for (const bank of db.banks) {
      const opt = document.createElement("option");
      opt.value = bank.id;
      opt.textContent = bank.name;
      qpBankSelect.appendChild(opt);
    }

    if (saved && db.banks.some(b => b.id === saved)) {
      qpBankSelect.value = saved;
    }
    renderChapterSelect();
  }

  function renderChapterSelect() {
    const bankId = qpBankSelect.value;
    safeSet(SK_BANK, bankId);
    qpChapterSelect.innerHTML = '';

    if (!bankId || !db) {
      qpChapterSelect.innerHTML = '<option value="">选择章节</option>';
      currentQuestions = [];
      currentIdx = -1;
      renderQuestionSelect();
      renderCurrentQuestion();
      return;
    }

    const bank = db.banks.find(b => b.id === bankId);
    if (!bank || !bank.chapters || bank.chapters.length === 0) {
      qpChapterSelect.innerHTML = '<option value="">暂无章节</option>';
      currentQuestions = [];
      currentIdx = -1;
      renderQuestionSelect();
      renderCurrentQuestion();
      return;
    }

    const saved = safeGet(SK_CHAPTER);
    qpChapterSelect.innerHTML = '<option value="">-- 章节 --</option>';
    for (const chap of bank.chapters) {
      const opt = document.createElement("option");
      opt.value = chap.id;
      opt.textContent = chap.name + " (" + (chap.questions ? chap.questions.length : 0) + ")";
      qpChapterSelect.appendChild(opt);
    }

    if (saved && bank.chapters.some(c => c.id === saved)) {
      qpChapterSelect.value = saved;
    }
    onChapterChange();
  }

  function onChapterChange() {
    const bankId = qpBankSelect.value;
    const chapterId = qpChapterSelect.value;
    safeSet(SK_CHAPTER, chapterId);

    if (!bankId || !chapterId || !db) {
      currentQuestions = [];
      currentIdx = -1;
      renderQuestionSelect();
      renderCurrentQuestion();
      return;
    }

    const bank = db.banks.find(b => b.id === bankId);
    const chapter = bank && bank.chapters ? bank.chapters.find(c => c.id === chapterId) : null;
    currentQuestions = chapter && chapter.questions ? chapter.questions : [];

    const savedIdx = parseInt(safeGet(SK_QUESTION) || "0", 10);
    currentIdx = currentQuestions.length > 0 ? Math.min(savedIdx, currentQuestions.length - 1) : -1;

    renderQuestionSelect();
    renderCurrentQuestion();
  }

  function renderQuestionSelect() {
    qpQuestionSelect.innerHTML = '';

    if (currentQuestions.length === 0) {
      qpQuestionSelect.innerHTML = '<option value="">无题目</option>';
      return;
    }

    currentQuestions.forEach((q, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = (idx + 1) + ". " + q.title;
      qpQuestionSelect.appendChild(opt);
    });

    if (currentIdx >= 0 && currentIdx < currentQuestions.length) {
      qpQuestionSelect.value = String(currentIdx);
    }
  }

  function selectQuestion(idx) {
    if (idx < 0 || idx >= currentQuestions.length) return;
    currentIdx = idx;
    safeSet(SK_QUESTION, String(idx));
    qpQuestionSelect.value = String(idx);
    renderCurrentQuestion();
  }

  function renderCurrentQuestion() {
    const total = currentQuestions.length;
    const has = currentIdx >= 0 && currentIdx < total;

    qpCounter.textContent = has ? (currentIdx + 1) + "/" + total : "0/" + total;
    qpPrevBtn.disabled = !has || currentIdx <= 0;
    qpNextBtn.disabled = !has || currentIdx >= total - 1;

    if (!has) {
      qpContent.innerHTML = '<div class="qpEmpty">选择题库 → 章节 → 题目</div>';
      return;
    }

    const q = currentQuestions[currentIdx];
    const content = q.content || "";

    if (!content.trim()) {
      qpContent.innerHTML = '<div class="qpEmpty">该题目暂无内容</div>';
    } else {
      qpContent.innerHTML = window.renderMarkdown ? window.renderMarkdown(content) : escapeHtml(content);
      if (window.applyHighlight) {
        window.applyHighlight(qpContent);
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // 事件绑定
  qpPrevBtn.addEventListener("click", () => { if (currentIdx > 0) selectQuestion(currentIdx - 1); });
  qpNextBtn.addEventListener("click", () => { if (currentIdx < currentQuestions.length - 1) selectQuestion(currentIdx + 1); });
  qpBankSelect.addEventListener("change", renderChapterSelect);
  qpChapterSelect.addEventListener("change", onChapterChange);
  qpQuestionSelect.addEventListener("change", () => {
    const idx = parseInt(qpQuestionSelect.value, 10);
    if (!isNaN(idx)) selectQuestion(idx);
  });

  // 键盘上下切换题目
  document.addEventListener("keydown", function (e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.target.closest(".monacoWrap")) return;

    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      if (currentIdx > 0) { e.preventDefault(); selectQuestion(currentIdx - 1); }
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      if (currentIdx < currentQuestions.length - 1) { e.preventDefault(); selectQuestion(currentIdx + 1); }
    }
  });

  loadDb();

  // ========== 垂直分隔条拖拽 ==========
  let vDragging = false, vStartX = 0, vStartW = 0;

  if (vResizeHandle) {
    vResizeHandle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      vDragging = true;
      vStartX = e.clientX;
      vStartW = questionPanel.offsetWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });
  }

  document.addEventListener("mousemove", function (e) {
    if (!vDragging) return;
    const dx = e.clientX - vStartX;
    // 最大50%可用宽度（去掉侧边栏64px）
    const maxW = Math.floor((window.innerWidth - 64) / 2);
    const newW = Math.max(280, Math.min(maxW, vStartW + dx));
    questionPanel.style.width = newW + "px";
    safeSet(SK_PANEL_W, String(newW));
  });

  document.addEventListener("mouseup", function () {
    if (vDragging) {
      vDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });

  const savedPanelW = safeGet(SK_PANEL_W);
  if (savedPanelW) questionPanel.style.width = savedPanelW + "px";

  // ========== Monaco Editor 初始化 ==========
  let editor = null;

  require.config({
    paths: { vs: "/vs" }
  });

  window.MonacoEnvironment = {
    getWorkerUrl: function () {
      return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
        self.MonacoEnvironment = { baseUrl: '/vs/' };
        importScripts('/vs/base/worker/workerMain.js');
      `)}`;
    }
  };

  require(["vs/editor/editor.main"], function () {
    // Python 代码片段
    monaco.languages.registerCompletionItemProvider("python", {
      provideCompletionItems: function (model, position) {
        const word = model.getWordUntilPosition(position);
        const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
        return { suggestions: [
          { label: "def",       kind: monaco.languages.CompletionItemKind.Snippet, insertText: "def ${1:func}(${2:args}):\n\t${3:pass}",  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "函数定义", range },
          { label: "class",     kind: monaco.languages.CompletionItemKind.Snippet, insertText: "class ${1:Cls}:\n\tdef __init__(self${2:}):\n\t\t${3:pass}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "类定义", range },
          { label: "for",       kind: monaco.languages.CompletionItemKind.Snippet, insertText: "for ${1:i} in ${2:range(n)}:\n\t${3:pass}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "for 循环", range },
          { label: "if",        kind: monaco.languages.CompletionItemKind.Snippet, insertText: "if ${1:cond}:\n\t${2:pass}",              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "if 语句", range },
          { label: "try",       kind: monaco.languages.CompletionItemKind.Snippet, insertText: "try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${3:print(e)}", insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "try-except", range },
          { label: "main",      kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'if __name__ == "__main__":\n\t${1:main()}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "main 入口", range },
          { label: "list_comp", kind: monaco.languages.CompletionItemKind.Snippet, insertText: "[${1:x} for ${2:x} in ${3:iter}]",       insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "列表推导式", range },
          { label: "print",     kind: monaco.languages.CompletionItemKind.Function, insertText: "print(${1})",  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "打印", range },
          { label: "input",     kind: monaco.languages.CompletionItemKind.Function, insertText: "input(${1})",  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: "输入", range },
        ]};
      }
    });

    const langCfg = LANGS[currentLang];
    editor = monaco.editor.create(monacoContainer, {
      value: getSavedCode(currentLang) || langCfg.defaultCode,
      language: langCfg.monacoId,
      theme: "vs-dark",
      fontSize: 14,
      lineHeight: 22,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontLigatures: true,
      tabSize: 4,
      insertSpaces: true,
      minimap: { enabled: true, maxColumn: 80 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      renderLineHighlight: "all",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      mouseWheelZoom: true,
      suggest: { showKeywords: true, showSnippets: true, showFunctions: true, showVariables: true },
      padding: { top: 8, bottom: 8 },
      roundedSelection: true,
      renderWhitespace: "selection",
      wordWrap: "off",
      quickSuggestions: true,
      parameterHints: { enabled: true },
      folding: true,
      foldingStrategy: "indentation",
      showFoldingControls: "mouseover",
      links: true,
      colorDecorators: true
    });

    editor.onDidChangeModelContent(function () {
      saveCode(editor.getValue());
    });

    editor.addAction({
      id: "run-code",
      label: "运行代码",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: function () { runCode(); }
    });

    editor.addAction({
      id: "save-code",
      label: "保存代码",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: function () {
        saveCode(editor.getValue());
        showOutputStatus("已保存", "success");
        setTimeout(function () { outputStatus.style.display = "none"; }, 1500);
      }
    });
  });

  // ========== 语言切换 ==========
  langSelect.addEventListener("change", function () {
    const newLang = langSelect.value;
    if (!LANGS[newLang] || newLang === currentLang) return;

    // 保存当前语言的代码
    if (editor) saveCode(editor.getValue());

    currentLang = newLang;
    safeSet(SK_LANG, newLang);

    if (editor) {
      const langCfg = LANGS[newLang];
      const savedCode = getSavedCode(newLang);
      const model = editor.getModel();

      // 切换语言和内容
      monaco.editor.setModelLanguage(model, langCfg.monacoId);
      editor.setValue(savedCode || langCfg.defaultCode);
    }
  });

  // ========== 全局快捷键 ==========
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (editor) saveCode(editor.getValue());
    }
  });

  // ========== 按钮事件 ==========
  runBtn.addEventListener("click", runCode);

  clearOutputBtn.addEventListener("click", function () {
    outputContent.innerHTML = '<span class="outputPlaceholder">输出已清空</span>';
    outputContent.className = "outputContent";
    outputStatus.style.display = "none";
    runMeta.textContent = "";
  });

  clearInputBtn.addEventListener("click", function () {
    stdinInput.value = "";
    saveStdin();
  });

  // ========== 运行代码 ==========
  let running = false;

  async function runCode() {
    if (running || !editor) return;

    const code = editor.getValue().trim();
    if (!code) {
      outputContent.innerHTML = '<span class="outputPlaceholder">请先编写代码</span>';
      return;
    }

    running = true;
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="runSpinner"></span> 运行中';
    outputContent.textContent = "";
    showOutputStatus("运行中", "running");
    runMeta.textContent = "";

    const startTime = performance.now();

    try {
      const resp = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: currentLang,
          code: editor.getValue(),
          stdin: stdinInput.value
        })
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      const data = await resp.json();

      if (!resp.ok) {
        outputContent.textContent = data.error || "请求失败";
        outputContent.className = "outputContent error";
        showOutputStatus("错误", "error");
        runMeta.textContent = elapsed + "s";
        return;
      }

      let output = "";
      let hasError = false;

      if (data.stdout) output += data.stdout;
      if (data.stderr) {
        if (output) output += "\n";
        output += data.stderr;
        hasError = true;
      }
      if (!output) output = "(无输出)";

      outputContent.textContent = output;

      if (data.exitCode !== 0) {
        outputContent.className = "outputContent error";
        showOutputStatus("退出码 " + data.exitCode, "error");
      } else if (hasError) {
        outputContent.className = "outputContent error";
        showOutputStatus("有警告", "error");
      } else {
        outputContent.className = "outputContent";
        showOutputStatus("成功", "success");
      }

      const timePart = data.executionTime ? data.executionTime + "ms" : "";
      runMeta.textContent = (timePart ? "执行 " + timePart + " · " : "") + "总计 " + elapsed + "s";

    } catch (err) {
      outputContent.textContent = "网络错误: " + err.message;
      outputContent.className = "outputContent error";
      showOutputStatus("网络错误", "error");
    } finally {
      running = false;
      runBtn.disabled = false;
      runBtn.innerHTML = '<span class="runBtnIcon">▶</span> 运行';
    }
  }

  function showOutputStatus(text, type) {
    outputStatus.textContent = text;
    outputStatus.className = "outputStatusBadge " + type;
    outputStatus.style.display = "inline-flex";
  }

  // ========== 水平拖拽分隔条 ==========
  let dragging = false, startY = 0, startH = 0;

  resizeHandle.addEventListener("mousedown", function (e) {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startH = bottomPanels.offsetHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    const dy = startY - e.clientY;
    const newH = Math.max(120, Math.min(500, startH + dy));
    bottomPanels.style.height = newH + "px";
    safeSet(SK_BOTTOM_H, String(newH));
  });

  document.addEventListener("mouseup", function () {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });

  const savedH = safeGet(SK_BOTTOM_H);
  if (savedH) bottomPanels.style.height = savedH + "px";

})();
