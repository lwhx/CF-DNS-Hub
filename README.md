# Cloudflare DNS 管理器

一个简单易用的Cloudflare DNS记录管理工具，支持查看、搜索、添加、修改和删除DNS记录。

## 功能特点

- 登录认证系统
- 查看所有DNS记录
- 搜索特定DNS记录
- 添加新的DNS记录
- 修改现有DNS记录
- 删除DNS记录

## 技术栈

- 前端：React + Vite + TailwindCSS
- 后端：Express.js
- API：Cloudflare API

## 部署说明

### 环境变量配置

在项目根目录创建`.env`文件，包含以下内容：

```
CLOUDFLARE_API_TOKEN=你的Cloudflare_API_Token
```

### 本地开发

1. 安装依赖

```bash
# 安装服务器依赖
cd server
npm install

# 安装客户端依赖
cd ../client
npm install
```

2. 启动服务

```bash
# 启动服务器
cd server
node server.js

# 启动客户端
cd ../client
npm run dev
```

### Docker部署

1. 构建镜像（在仓库根目录执行）：
   ```bash
   docker build -t cf-dns-hub .
   ```
2. 运行容器，并通过环境变量注入 Cloudflare Token：
   ```bash
   docker run -d \
     --name cf-dns-hub \
     -p 4000:4000 \
     --env-file .env \
     cf-dns-hub
   ```
   `.env` 文件需要包含 `CLOUDFLARE_API_TOKEN`。容器启动后，通过 `http://localhost:4000` 访问前端界面，API 仍然在 `/api/*` 路径下。
3. 如需持久化密码文件，可挂载宿主机目录：
   ```bash
   docker run -d \
     --name cf-dns-hub \
     -p 4000:4000 \
     --env-file .env \
     -v ./data/password.json:/app/server/password.json \
     cf-dns-hub
   ```

## 默认登录信息

- 默认密码：`admin`
- 可在登录界面修改密码
