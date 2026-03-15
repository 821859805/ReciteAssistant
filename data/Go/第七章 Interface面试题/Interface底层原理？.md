**how**：
- eface是空的interface{}实现，只包含两个指针：`_type`指向类型信息，`data`指向实际数据。这就是为什么空接口能存储任意类型值的原因，通过类型指针来标识具体类型，通过数据指针来访问实际值
- iface是带方法的interface实现，包含`itab`和`data`两部分。`itab`是核心，它存储了接口类型、具体类型，以及方法表。方法表是个函数指针数组，保存了该类型实现的所有接口方法的地址。

**代码**：
eface：
```go
type eface struct {
   _type *_type
   data  unsafe.Pointer
}
```

iface定义：
```go
type iface struct {
   tab  *itab
   data unsafe.Pointer
}

type itab struct {
   inter *interfacetype
   _type *_type
   hash  uint32 // copy of _type.hash. Used for type switches.
   _     [4]byte
   fun   [1]uintptr // variable sized. fun[0]==0 means _type does not implement inter.
}
```