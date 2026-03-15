**how**：
Go语言的内存分配采用了TCMalloc算法，核心是分级分配和本地缓存。分配器架构是这样的，分为mcache线程缓存、mcentral中央缓存、mheap页堆。每个逻辑处理器都有独立的mcache，避免了锁竞争；mcentral按对象大小分类管理；mheap负责从操作系统申请大块内存。
**对象分类分配**：
- 小于16字节的是微小对象，在mcache的tiny分配器中分配，多个微小对象可以共享一个内存块
- 小于32KB的为小对象，通过size class机制，预定义了67种大小规格，优先从P的mcache中对应的mspan中分配，如果mcache没有内存，则从mcentral获取，如果mcentral也没有，则向mheap申请，如果mheap也没有，则从操作系统申请内存
- 大于32KB为大对象，直接从mheap分配，跨越多个页面