SSE全称Server-Sent Events，服务器发送事件，能让服务器能够主动向客户端持续推送实时数据，具体流程如下

客户端向服务器发起HTTP GET请求，其中Accept请求头为text/event-stream告诉服务器要进行流式输出，Connection为keep-alive告诉服务器需要长连接

服务器响应200 OK，响应头必须包含Content-Type：text/event-stream，表示连接不关闭

消息格式，包括消息id、event事件名、retry重连间隔、数据。消息最后有一个空行表示消息结束

