**是什么：**CSP全称Communication Sequential Process，通信顺序进程，通过通信共享内存，channel就是CSP的经典实现。

**为什么：**
- 协程通过channel通信而不是直接修改变量
- channel发送和接收自带同步机制，无需手动上锁
- channel可以嵌套使用

**怎么做：**
Channel的底层是一个名为`hcan`的结构体，包含环形缓冲区、两个等待队列、互斥锁三个关键部分。
- 环形缓冲区：是一个环形队列，buf指针指向缓冲区，sendx和recvx记录发送和接收的位置索引
- 两个等待队列senq和recvq：用来管理阻塞的协程，sendq存储被阻塞的发送者，recvq存储被阻塞的发送者，队列由双向链表实现。
- 互斥锁：所有的发送、接收都需要获取锁