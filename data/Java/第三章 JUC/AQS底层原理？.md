**是什么：**全称抽象队列同步器，是一个用于构建锁的框架

**原理：**
（1）状态state：含义取决于具体实现类，在Semapore里，表示剩余容量；在CountDownLatch里，表示还需要倒数的次数；在ReentrantLock中，表示锁的重入次数
（2）FIFO队列：一个双向链表形式的队列，多个线程争抢同一把锁时，线程会进入这个等待队列中。
（3）获取释放方法：每个实现类都要重写tryAcquire和tryRelease方法。在Semaphore里，通过acquire进行P操作，通过release进行V操作；在CountDownLatch里，通过countDown方法，将倒计时减一。
