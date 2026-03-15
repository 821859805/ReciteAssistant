（1）首次下载，客户端向服务器发送GET请求下载文件，服务器响应头携带Accept-Ranges：bytes表示支持断点续传、Content-Length总字节数。

（2）断点续传：客户端请求头携带Range字段，告诉服务器要请求第几个字节到第几个字节的数据。服务器响应头携带Content-Range，将客户端请求的部分返回客户端，并响应状态码206 Partial Content。