# syntax=docker/dockerfile:1

# --- ビルドステージ ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN npm ci
COPY . .
RUN npm run build
# CLI ステージへ受け渡す配布物(dist/taskaror.cjs + dist/web 同梱)を tarball にする
# (--pack-destination は出力先を自動作成しないため、先に mkdir する)
RUN mkdir -p /tmp/pack && npm pack -w taskaror --pack-destination /tmp/pack

# --- 配信ステージ(nginx で web の dist を配信) ---
FROM nginx:alpine AS serve
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80

# --- CLI ステージ(taskaror を entrypoint にしたイメージ) ---
# 例: docker run --rm -p 5173:5173 taskaror serve
FROM node:24-alpine AS cli
COPY --from=build /tmp/pack/*.tgz /tmp/pack/
RUN npm install -g /tmp/pack/*.tgz && rm -rf /tmp/pack
# コンテナ外からアクセスできるよう、serve の既定 bind 先を全インターフェースにする
ENV TASKAROR_SERVE_HOST=0.0.0.0
# ファイル引数を取るコマンド(validate / svg など)用の作業ディレクトリ。
# 例: docker run --rm -v $PWD:/work taskaror validate task.taskspec.yaml
WORKDIR /work
EXPOSE 5173
ENTRYPOINT ["taskaror"]
CMD ["--help"]
