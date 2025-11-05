# Multi-stage build to produce a single image serving API + built UI

# Build client
FROM node:18-alpine AS client-build
WORKDIR /app/client

# 仅复制依赖清单，加快缓存命中并避免无关变更导致重装
COPY client/package*.json ./

# 可选：支持自定义 npm 源（国内网络或企业代理）
ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

# 稳健安装依赖：优先使用 ci（如无 lock 则回退到 install）
# 不要忽略错误（去掉了 `|| true`），否则 build 期才暴露问题难以排查
RUN if [ -f package-lock.json ]; then \
      npm ci --no-fund --no-audit --silent; \
    else \
      npm install --no-fund --no-audit --silent; \
    fi

# 复制源码并构建
COPY client/ ./
# 某些环境下 .bin 或 vite.js 权限位异常，显式授予执行权限
RUN chmod -R +x node_modules/.bin || true
RUN chmod +x node_modules/vite/bin/vite.js || true
RUN npm run build

# Install server deps
FROM node:18-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
ARG NPM_REGISTRY=""
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi
# 提高 npm 的网络健壮性（重试与超时）
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-fund --no-audit; \
    else \
      npm install --omit=dev --no-fund --no-audit; \
    fi
COPY server/ ./

# Runtime image
FROM node:18-alpine
ENV NODE_ENV=production
WORKDIR /app

# Copy server and built client
COPY --from=server-build /app/server /app/server
COPY --from=client-build /app/client/dist /app/client/dist

EXPOSE 3000
CMD ["node", "server/server.js"]
