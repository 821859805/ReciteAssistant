# ============================================================
#  ReciteAssistant - 多语言代码编辑器 & 背书助手
#  基于 Node.js 22 + 多语言运行时
# ============================================================

FROM node:22-bookworm-slim AS base

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONIOENCODING=utf-8 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# ---- 安装多语言运行时 ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python
    python3 python3-pip \
    # C / C++
    gcc g++ \
    # Bash (已包含在 base)
    bash \
    # 通用工具
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# python3 -> python 软链接（兼容代码中 python3 调用）
RUN ln -sf /usr/bin/python3 /usr/bin/python

# ---- 可选：Go 运行时 ----
# 如果需要 Go 支持，取消注释以下行
# ENV GOLANG_VERSION=1.22.1
# RUN curl -fsSL https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz | tar -C /usr/local -xzf -
# ENV PATH="/usr/local/go/bin:${PATH}"

# ---- 可选：Rust 运行时 ----
# 如果需要 Rust 支持，取消注释以下行
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
# ENV PATH="/root/.cargo/bin:${PATH}"

# ---- 可选：Java 运行时 ----
# 如果需要 Java 支持，取消注释以下行
# RUN apt-get update && apt-get install -y --no-install-recommends default-jdk && rm -rf /var/lib/apt/lists/*

# ============================================================
#  应用构建
# ============================================================

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json package-lock.json ./

# 安装生产依赖
RUN npm ci --omit=dev

# 复制项目源码
COPY server.js ./
COPY public ./public/

# 创建数据和工作空间目录
RUN mkdir -p /app/data/workspace /app/data/tmp

# 数据目录作为卷挂载点（持久化题库数据）
VOLUME ["/app/data"]

# 暴露端口
EXPOSE 5179

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5179/api/db || exit 1

# 启动
CMD ["node", "server.js"]

