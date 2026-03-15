**P创建时机**：P在调度器初始化时一次性创建，在schedinit()函数中调用procresize()，根据GOMAXPROCS值创建对应数量P对象，存储在全局的allp数组中。之后P的数量基本固定，只有在调用runtime.GOMAXPROCS()动态调整时才会重新分配P。
**M创建时机**：M采用按需创建策略，初始只有m0存在，当出现以下情况时会创建新的M：所有M都在执行阻塞