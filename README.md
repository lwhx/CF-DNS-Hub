# Cloudflare DNS 管理器

一个简单易用的Cloudflare DNS记录管理工具，支持查看、搜索、添加、修改和删除DNS记录。

## 功能特点

- 登录认证系统（密码存储在云端）
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

### Vercel部署

1. 在Vercel中导入GitHub仓库
2. 配置环境变量`CLOUDFLARE_API_TOKEN`
3. 部署应用

## 默认登录信息

- 默认密码：`admin`
- 可在登录界面修改密码