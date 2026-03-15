**是什么：**select是go专门为channel设计的多路复用机制。

**有什么用：**能够同时监听多个channel操作，当有多个channel都有数据收发时，select能随机选择其中一个进行操作，比如监听数据输入、超时信号、取消信号

**底层原理**：
- **数据结构**通过scase结构体表示每个case语句，这个结构包含channel指针hchan、数据指针、case类型（包括caseNil、caseRecv、caseSend、caseDefault），程序计数器、释放时间。
- **运行机制：**运行时对所有case随机排序，避免饥饿。然后执行两轮扫描策略：第一轮直接检查每个channel是否可读写，如果可以则立即执行。如果没有一个可读写，则第二轮就把当前协程加入到所有channel的发送或接收队列中，然后调用gopark进入阻塞态，让出CPU