（1）NEW：创建态，但没有调用start运行
（2）RUNNABLE：就绪态，已经调用start，但是没有被调度
（3）BLOCKED：阻塞态，没有获取锁则被阻塞
（4）WAITING：等待态，等待另一个线程的唤醒
（5）TIMED_WATING：有指定时间的等待态
（6）TERMINATED：终止态