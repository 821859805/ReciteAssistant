import hljs from "/vendor/hljs/common.js";

window.hljs = hljs;
window.applyHighlight = (root) => {
  const el = root || document;
  const nodes = el.querySelectorAll ? el.querySelectorAll("pre code") : [];
  nodes.forEach((code) => {
    try {
      hljs.highlightElement(code);
    } catch {
      // ignore
    }
  });
};

// 如果页面在 hljs 加载前就渲染了 Markdown，延迟队列会在这里补一次
if (Array.isArray(window.__hljsPending)) {
  const pending = window.__hljsPending.slice();
  window.__hljsPending.length = 0;
  pending.forEach((el) => {
    try {
      window.applyHighlight(el);
    } catch {
      // ignore
    }
  });
}

