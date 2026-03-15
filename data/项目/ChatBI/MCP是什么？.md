**是什么：**MCP全称Model Context Protocol，模型上下文协议，是一种专门为AI调用外部系统、数据库而设计的一种统一的协议

**原理：**MCP由MCP客户端、MCP服务器以及传输协议三个部分组成，MCP服务器定义了有哪些MCP工具，MCP客户端需要访问MCP服务器才能获取工具，我们的项目使用的是streamHTTP协议实现MCP客户端和服务器之间的通信，这是一种流式的HTTP请求，使用JSON-RPC 2.0协议规定的请求体，该请求体包含：请求id、jsonrpc版本、使用的方法、变量四个字段，响应体包含：请求id、jsonrpc版本和result三个字段。

刚介绍完了MCP是什么，现在我来介绍一下LLM调用一次MCP工具的完整过程。