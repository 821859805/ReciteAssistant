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

