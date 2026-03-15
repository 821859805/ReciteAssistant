MinorGC，只回收年轻代的Eden园区、S0和S1区，频率很高。当Eden区空间不足时触发

MajorGC，主要针对老年代进行回收，频率比MinorGC低。当老年代空间不足或者晋升到老年代速度过快可能触发

FullGC，对整个堆都进行回收，是最昂贵的操作，需要STW。可以调用System.gc()、Runtime.getRuntime().gc()建议JVM回收，Minor GC时如果老年代空间不足时触发，永久代或元空间空间不足时触发