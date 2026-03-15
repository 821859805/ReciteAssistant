**what**：go语言里的context实际上是一个接口，提供了Deadline()，Done()，Err()以及Value()四种方法。它在Go 1.7 标准库被引入。本质上是一个信号传递和范围控制的工具。它的核心作用是在一个请求处理链路中（跨越多个函数和goroutine），优雅地传递取消信号（cancellation）、超时（timeout）和截止日期（deadline），并能携带一些范围内的键值对数据。

**why**：
- **超时控制：**一个HTTP请求需要调用多个下游服务，我们通过`context.WithTimeout`设置整体超时时间，当超时发生时，所有子操作都会收到取消信号并立即退出，避免资源浪费。取消信号的传播是通过Context来实现的，父Context取消时，所有子Context都会自动取消

- **请求级的数据传递：**Context能传递用户ID、请求ID等请求级的元数据。需要注意的时，Context应该作为函数的第一个参数传递，不要存储在结构体中，并且传递的数据应该是请求级别的，不要滥用

**how：**
```go
type Context interface {
    Deadline() (deadline time.Time, ok bool)  // Deadline方法的第一个返回值表示还有多久到期， 第二个返回值代表是否被超时时间控制
    Done() <-chan struct{}  // Done() 返回一个 只读channel，当这个channel被关闭时，说明这个context被取消
    Err() error // Err() 返回一个错误，表示channel被关闭的原因，例如是被取消，还是超时关闭
    Value(key interface{}) interface{}) // value方法返回指定key对应的value，这是context携带的值
}
```
- `Deadline()`返回一个时间点，告知任务何时应该被取消
- `Done()`返回一个channel，当`Context`被取消或超时，这个channel会被关闭，这是写成监听或取消信号的核心
- `Err()`在`Done()`的channel关闭后，它会解释关闭的原因，是主动取消（Canceled）还是超时（DeadlineExceeded）
- `Value()` - 允许Context在调用链中携带请求范围的键值对数据
