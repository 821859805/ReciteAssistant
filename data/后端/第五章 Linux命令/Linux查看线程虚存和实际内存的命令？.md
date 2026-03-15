实时查看：top -H -p <PID> # -H是显示线程，如果不加，则之查看进程；-p表示指定PID。

静态查看：ps -eL -o tid,rss,vsize # tid是虚拟内存（KB）、rss是实际物理内存、tid是线程ID 