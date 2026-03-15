首先，快速定位死锁进程，找到目标进程PID：
- ps -ef | grep 进程名
- top

然后，查看线程状态，判断是否阻塞
- top -H -p <PID>
看看有没有大量协程的load average平均负载为0

最后，使用jstack <PID> > stack.log导出栈信息，查找与锁相关的内容，判断是否有死锁
