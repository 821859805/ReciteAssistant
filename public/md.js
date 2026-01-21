// 简易 Markdown 渲染器（纯前端，无需构建/无外部依赖）
// - 安全：不支持原始 HTML，所有输入先 escape
// - 覆盖常用：标题、粗体/斜体、行内代码、代码块、列表、引用、分隔线、链接

(function () {
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderInline(text) {
    let t = text;
    // links: [text](url)
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const safeUrl = String(url).replace(/"/g, "%22");
      return `<a href="${safeUrl}" target="_blank" rel="noreferrer noopener">${label}</a>`;
    });
    // inline code
    t = t.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
    // bold
    t = t.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => `<strong>${inner}</strong>`);
    // italic (avoid conflict with bold)
    t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_m, pre, inner) => `${pre}<em>${inner}</em>`);
    return t;
  }

  function renderMarkdown(md) {
    const raw = md == null ? "" : String(md);
    const src = escapeHtml(raw).replace(/\r\n/g, "\n");

    // fenced code blocks
    const codeStore = [];
    let text = src.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
      const idx = codeStore.length;
      const language = (lang || "").trim();
      codeStore.push({ language, code });
      return `@@CODEBLOCK_${idx}@@`;
    });

    const lines = text.split("\n");
    const out = [];
    let inUl = false;
    let inOl = false;
    let inQuote = false;

    function closeLists() {
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
    }
    function closeQuote() {
      if (inQuote) {
        closeLists();
        out.push("</blockquote>");
        inQuote = false;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // empty line
      if (!trimmed) {
        closeLists();
        closeQuote();
        continue;
      }

      // code block placeholder (as standalone line)
      const cb = trimmed.match(/^@@CODEBLOCK_(\d+)@@$/);
      if (cb) {
        closeLists();
        closeQuote();
        const item = codeStore[Number(cb[1])];
        const cls = item.language ? ` class="language-${item.language}"` : "";
        out.push(`<pre><code${cls}>${item.code}</code></pre>`);
        continue;
      }

      // hr
      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        closeLists();
        closeQuote();
        out.push("<hr/>");
        continue;
      }

      // blockquote
      if (/^&gt;\s?/.test(trimmed)) {
        if (!inQuote) {
          closeLists();
          out.push("<blockquote>");
          inQuote = true;
        }
        const qText = trimmed.replace(/^&gt;\s?/, "");
        out.push(`<p>${renderInline(qText)}</p>`);
        continue;
      } else {
        closeQuote();
      }

      // headings
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeLists();
        const level = h[1].length;
        out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
        continue;
      }

      // ordered list
      const ol = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (ol) {
        if (!inOl) {
          closeLists();
          out.push("<ol>");
          inOl = true;
        }
        out.push(`<li>${renderInline(ol[2])}</li>`);
        continue;
      }

      // unordered list
      const ul = trimmed.match(/^[-*]\s+(.*)$/);
      if (ul) {
        if (!inUl) {
          closeLists();
          out.push("<ul>");
          inUl = true;
        }
        out.push(`<li>${renderInline(ul[1])}</li>`);
        continue;
      }

      // paragraph
      closeLists();
      out.push(`<p>${renderInline(trimmed)}</p>`);
    }

    closeLists();
    closeQuote();

    return out.join("\n").replace(/@@CODEBLOCK_(\d+)@@/g, (_m, n) => {
      const item = codeStore[Number(n)];
      const cls = item.language ? ` class="language-${item.language}"` : "";
      return `<pre><code${cls}>${item.code}</code></pre>`;
    });
  }

  window.renderMarkdown = renderMarkdown;
})();

