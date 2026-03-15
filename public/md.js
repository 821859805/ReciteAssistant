// 简易 Markdown 渲染器（纯前端，无需构建/无外部依赖）
// - 安全：不支持原始 HTML，所有输入先 escape
// - 覆盖常用：标题、粗体/斜体、行内代码、代码块、列表、引用、分隔线、链接、表格

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
    // strikethrough ~~text~~
    t = t.replace(/~~([^~]+)~~/g, (_m, inner) => `<del>${inner}</del>`);
    return t;
  }

  /** 判断一行是否为表格分隔行（如 |---|---|---| 或 | :---: | --- |） */
  function isTableSeparator(line) {
    const trimmed = line.trim();
    // 去掉首尾的 |
    const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    const cells = inner.split("|");
    if (cells.length === 0) return false;
    return cells.every(c => /^\s*:?-{1,}:?\s*$/.test(c));
  }

  /** 解析表格对齐方式 */
  function parseTableAligns(sepLine) {
    const inner = sepLine.trim().replace(/^\|/, "").replace(/\|$/, "");
    return inner.split("|").map(c => {
      const s = c.trim();
      const left = s.startsWith(":");
      const right = s.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      return "left";
    });
  }

  /** 解析表格行的单元格内容 */
  function parseTableCells(line) {
    const trimmed = line.trim();
    const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
    return inner.split("|").map(c => c.trim());
  }

  /** 将连续的表格行渲染成 HTML table */
  function renderTable(headerLine, sepLine, bodyLines) {
    const aligns = parseTableAligns(sepLine);
    const headers = parseTableCells(headerLine);
    const rows = bodyLines.map(l => parseTableCells(l));

    let html = '<div class="table-wrapper"><table>\n<thead>\n<tr>';
    for (let i = 0; i < headers.length; i++) {
      const align = aligns[i] || "left";
      const style = align !== "left" ? ` style="text-align:${align}"` : "";
      html += `<th${style}>${renderInline(headers[i] || "")}</th>`;
    }
    html += "</tr>\n</thead>\n<tbody>\n";

    for (const row of rows) {
      html += "<tr>";
      for (let i = 0; i < headers.length; i++) {
        const align = aligns[i] || "left";
        const style = align !== "left" ? ` style="text-align:${align}"` : "";
        html += `<td${style}>${renderInline(row[i] || "")}</td>`;
      }
      html += "</tr>\n";
    }
    html += "</tbody>\n</table></div>";
    return html;
  }

  function renderMarkdown(md) {
    const raw = md == null ? "" : String(md);
    const src = escapeHtml(raw).replace(/\r\n/g, "\n");

    const lines = src.split("\n");
    const out = [];
    let inUl = false;
    let inOl = false;
    let inQuote = false;
    let inCode = false;
    let codeLang = "";
    let codeLines = [];

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
    function closeCodeBlock() {
      if (!inCode) return;
      closeLists();
      closeQuote();
      const cls = codeLang ? ` class="language-${codeLang}"` : "";
      out.push(`<pre><code${cls}>${codeLines.join("\n")}</code></pre>`);
      inCode = false;
      codeLang = "";
      codeLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // fenced code block (standard-ish): ```lang  / closing ```
      const fence = trimmed.match(/^```([a-zA-Z0-9_+-]+)?\s*$/);
      if (fence) {
        if (!inCode) {
          closeLists();
          closeQuote();
          inCode = true;
          codeLang = (fence[1] || "").trim();
          codeLines = [];
        } else {
          closeCodeBlock();
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      // empty line
      if (!trimmed) {
        closeLists();
        closeQuote();
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

      // table detection:
      // current line contains |, next line is separator, and there's at least a header
      if (trimmed.includes("|") && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (isTableSeparator(nextLine)) {
          closeLists();
          // collect table body lines
          const headerLine = trimmed;
          const sepLine = nextLine;
          const bodyLines = [];
          let j = i + 2;
          while (j < lines.length && lines[j].trim().includes("|") && lines[j].trim() !== "") {
            bodyLines.push(lines[j].trim());
            j++;
          }
          out.push(renderTable(headerLine, sepLine, bodyLines));
          i = j - 1; // skip processed lines
          continue;
        }
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

    // unclosed code block: still render as code
    closeCodeBlock();
    closeLists();
    closeQuote();
    return out.join("\n");
  }

  window.renderMarkdown = renderMarkdown;
})();
