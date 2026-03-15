**是什么**：通过两个Map，read和dirty实现读写分离，针对特定场景“读”操作无锁

**使用场景：**读多写少的场景

**具体实现：**read是一个可读的map，提供无锁的并发读取，速度很快。写操作会先上锁并写入dirty，dirty积累到一定程度或者read中没有某个key时，sync.Map会将dirty同步到read中。

**底层数据结构：**
（1）sync.Map结构体有四个字段，mu互斥量，read只读字段，dirty具体的map，misses计数器，mu用于给dirty上锁，read记录了一个readOnly结构的数据，dirty是底层的map结构，misses记录了从read字段中读取数据时没有命中的次数，misses值等于dirty长度时，dirty提升为read
（2）readOnly有两个字段，m是map类型，amended布尔类型，如果为true则表明dirty中包含read中没有的数据，false表示dirty中的数据在read中都存在

