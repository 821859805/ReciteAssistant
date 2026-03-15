基本类型：
- string、hash、list、set、zset

高级类型：
- bitmap，0或1，用于签到这类的业务
- hyperloglog：海量数据统计的场景，比如百万级网页UV计数等
- geo：存储地理位置的信息
- stream：消息队列