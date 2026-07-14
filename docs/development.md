# 開発ガイド

taskaror の開発環境のセットアップ・コマンド・アーキテクチャをまとめる。
利用者向けの使い方は [README](../README.md) を参照。

## 必要環境

- Node.js v24 系(推奨)と npm。CLI の実行だけなら Node.js 20 以上で動く
- Docker(任意。コンテナでの開発・動作確認に使う)

## セットアップとコマンド

コマンドはすべてリポジトリルートで実行する(npm workspaces 経由で各パッケージへ委譲される)。

```bash
npm install           # 依存関係のインストール

npm run dev           # 開発サーバーを起動(Vite / HMR、http://localhost:5173)
npm run build         # 本番ビルド(tsc -b → web → cli の順)
npm run preview       # web のビルド成果物をプレビュー

npm run test          # Vitest(1 回実行。全パッケージ一括)
npm run test:watch    # Vitest(watch モード)
npm run typecheck     # 型チェック(tsc -b)
npm run lint          # ESLint
npm run lint:fix      # ESLint(自動修正)
npm run format        # Prettier(整形。セミコロンなし・シングルクォート)
npm run format:check  # Prettier(チェックのみ)
```

コアロジック(検証・スケジュール導出・lint・ガントのレイアウト計算)は原則 Vitest で
テストを書く。CI(GitHub Actions)では typecheck / lint / format:check / test / build を
実行している。

## Docker

```bash
# 開発用: Vite dev server(http://localhost:5173)
docker compose up dev

# 本番ビルド確認: nginx で web の dist を配信(http://localhost:8080)
docker compose --profile prod up web --build

# CLI イメージ(taskaror が entrypoint)
docker build --target cli -t taskaror .
docker run --rm -p 5173:5173 taskaror serve
```

`dev` / `web` プロファイルは開発・確認用の便宜であり、製品レベルの統一起動コマンドは
`taskaror serve`(CLI イメージ)とする([decisions.md](decisions.md) 参照)。

## アーキテクチャ

npm workspaces のモノレポ構成。

- `packages/core`(`@taskaror/core`) — コアロジック(検証・スケジュール導出・lint・
  ガントのレイアウト計算)と型定義。ブラウザ / React 非依存の純粋な TypeScript で、
  tsc ビルドせずソースをそのまま `exports` で公開する内部パッケージ
  (web は Vite が、cli は esbuild がソースを直接処理する)。
  `@taskaror/core/<module>` が `src/lib/<module>.ts` に対応する
- `packages/web`(`@taskaror/web`) — Vite + React 19 + TypeScript の SPA(GUI エディタ)
- `packages/cli`(`taskaror`) — CLI。esbuild で単一の CJS(`dist/taskaror.cjs`)に
  バンドルし、ビルド済みの web(`dist/web`)を同梱して配布する(ランタイム依存なし)。
  サブコマンドは `src/cli.ts` のレジストリに追記する
- `schema/`・`examples/`・`docs/` はリポジトリルートに置く(`schema/` は `$id` の
  URL パスとディレクトリ構造を一致させるため移動しない)

ルートの `npm run build` は 型チェック → web → cli の順に実行し、cli のビルドで
web の `dist` を `packages/cli/dist/web` へコピーする(この順序が前提)。
CLI はネイティブバイナリ化せず、npx と Docker の 2 経路で実行する
(方針の経緯は [decisions.md](decisions.md))。

TaskSpec のフォーマットを変更するときは、schema・型定義・コアロジックの 3 箇所を
同期させる必要がある(詳細は [CLAUDE.md](../CLAUDE.md) の「TaskSpec とフォーマット同期」)。

## ドキュメントと GitHub Pages

ドキュメントは `docs/` 配下に集約し、公開/非公開で置き場所を分ける
([decisions.md](decisions.md) の「ドキュメントの公開区分」参照)。

- `docs/site/` — 利用者向け(GitHub Pages で公開)。Rspress 製のドキュメントサイト
  (`@taskaror/docs` ワークスペース)。コンテンツは `docs/site/docs/` 配下:
  TaskSpec 仕様・GUI / CLI の操作方法・
  スケジュール導出([site/docs/derivation.md](site/docs/derivation.md))・
  lint ルール([site/docs/lint.md](site/docs/lint.md))
- `docs/` 直下 — 開発者向け(公開しない)。本ファイルと [decisions.md](decisions.md)

公開サイトは https://yosiopp.github.io/taskaror/ 。main への push
(`docs/site/**` の変更)を契機に .github/workflows/pages.yml が Rspress でビルドして
デプロイする。ローカルでは `npm run docs:dev`(dev server)/ `npm run docs:build`
(`docs/site/doc_build` に出力)で確認できる。**初回のみ**リポジトリの
Settings → Pages → Build and deployment → Source を「GitHub Actions」に
設定する必要がある。

rspress は React 18 前提のため、モノレポのルートに hoist された web 用 React 19 と
共存できるよう、docs/site 直下に react / react-dom / react-helmet-async を devDependencies
として持ち、rspress.config.ts の alias で単一のコピーに解決させている。この alias を
外すと react-helmet-async が二重バンドルされ、全ページの SSG が失敗して CSR
フォールバック(中身が空の HTML)に劣化するので注意。

## スクリーンショットの更新

docs/site/docs/images/ のスクリーンショット(ガント / WBS表 / YAML)は、UI 変更後に
[.claude/skills/screenshots/](../.claude/skills/screenshots/) の手順(SKILL.md)で撮り直す。
dev サーバを起動し、システムの Chrome(playwright-core)で 3 ビューを操作して撮影する。

## 関連ドキュメント

- [decisions.md](decisions.md) — 設計方針・決定記録
- [site/](site/) — 利用者向けドキュメント(GitHub Pages のソース)
- [tasks.md](../tasks.md) — 開発タスクの管理
