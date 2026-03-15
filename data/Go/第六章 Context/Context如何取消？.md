**how：**

主动取消，通过`context.WithCancel`创建的Context会返回一个cancel函数，调用这个函数就会关闭内部的done channel，所有监听这个Context的goroutine都能通过`**ctx.Done()**`收到取消信号。

超时取消，`**context.WithTimeout**`和`**context.WithDeadline**`会启动一个定时器，到达指定时间后自动调用cancel函数触发取消。

级联取消，当父Context被取消时，所有子Context会自动被取消，这是通过Context树的结构实现的。