# 使用官方 Node.js LTS 镜像作为基础镜像
# 选择一个基于 Debian 的镜像，通常包含或可以轻松安装 ca-certificates
FROM node:lts-bookworm-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
# 使用 .dockerignore 忽略不需要复制的文件和目录 (如 node_modules)
COPY package*.json ./

# 安装项目依赖
# 考虑在生产环境中跳过开发依赖
RUN npm install --production

# 复制所有后端代码到容器中
COPY . .

# 安装 ca-certificates 并运行 update-ca-certificates
# 这有助于确保您的 Node.js 应用信任最新的 SSL/TLS 证书，这对于支付等需要安全连接的功能非常重要
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*

# 暴露应用监听的端口 (根据您之前的配置，我们使用 8080)
EXPOSE 8080

# 定义容器启动时执行的命令
# 这个命令会运行您 package.json 中的 start 脚本
CMD [ "npm", "start" ] 