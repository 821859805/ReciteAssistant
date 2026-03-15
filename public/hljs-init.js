// highlight.js 初始化
// hljs-bundle.js 已在此脚本之前加载，window.hljs 可用

(function () {
  if (!window.hljs) {
    console.warn("highlight.js 未加载，代码高亮不可用");
    window.applyHighlight = function () {};
    return;
  }

  // 配置 highlight.js
  window.hljs.configure({
    ignoreUnescapedHTML: true,
  });

  /**
   * 对容器内所有 <pre><code> 块应用语法高亮
   * @param {HTMLElement} root - 包含代码块的容器元素
   */
  window.applyHighlight = function (root) {
    if (!root || !window.hljs) return;
    const blocks = root.querySelectorAll("pre code");
    blocks.forEach(function (block) {
      // 避免重复高亮
      if (block.dataset.highlighted === "yes") return;
      try {
        window.hljs.highlightElement(block);
      } catch (e) {
        // ignore
      }
    });
  };

  // 处理延迟队列（在 hljs 加载前就渲染了 Markdown 的情况）
  if (Array.isArray(window.__hljsPending)) {
    var pending = window.__hljsPending.slice();
    window.__hljsPending.length = 0;
    pending.forEach(function (el) {
      try {
        window.applyHighlight(el);
      } catch (e) {
        // ignore
      }
    });
  }
})();
