# syntax=docker/dockerfile:1

# --- ビルドステージ ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/
RUN npm ci
COPY . .
RUN npm run build

# --- 配信ステージ ---
FROM nginx:alpine AS serve
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
