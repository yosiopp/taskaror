# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

taskaror は、YAML ベースのタスク定義フォーマット **TaskSpec** を編集・検証・可視化するための OSS(リファレンス実装)。npm workspaces のモノレポ構成で、共有コア(`packages/core`)と Vite + React 19 + TypeScript の SPA(`packages/web`)からなる(将来 `packages/cli` を追加予定)。

- プロジェクト名は常に小文字の「taskaror」。文頭・見出しでも大文字にしない。「TaskSpec」はそのまま表記する。
- ドキュメント・コードコメント・UI 文言・エラーメッセージは日本語で書く。

## コマンド

すべてリポジトリルートで実行する(各パッケージへは npm workspaces 経由で委譲される)。

```bash
npm run dev           # Vite dev server (HMR)
npm run build         # tsc -b && vite build(出力は packages/web/dist)
npm run typecheck     # tsc -b(型チェックのみ)
npm run test          # Vitest(1 回実行。全パッケージ一括)
npm run test:watch    # Vitest(watch モード)
npm run lint          # ESLint
npm run lint:fix
npm run format        # Prettier(セミコロンなし・シングルクォート)
npm run format:check
```

### Docker

Docker は colima 経由で動く環境。docker コマンドが失敗したら `colima start` を提案する(勝手に起動しない)。

```bash
docker compose up dev                      # 開発用 (port 5173)
docker compose --profile prod up web --build  # 本番ビルド確認: nginx で dist 配信 (port 8080)
```

## 開発の進め方

タスクは [tasks.md](tasks.md) で管理する。着手はフェーズ順を基本とする。

- **コミット** — 適度な粒度でコミットする。コミットメッセージは簡潔に 1 行で書き、Co-Authored-By などの AI エージェント情報は付けない
- **セルフレビュー** — 定期的に `/code-review`・`/simplify` 相当のセルフレビュー・リファクタリングを行い、その結果をコミットする
- **ドキュメント** — `docs/` 配下に必要なドキュメントを整備し、実装と docs を同期させながら更新する
- **テスト** — 必要ならテストコードも書く(コアロジックは原則テストを書く)
- **タスク完了の条件** — 実装が終わったら動作確認(実際に動かす・テスト実行)をしてから、tasks.md の該当タスクにチェックをつける

## アーキテクチャ

### モノレポ構成(npm workspaces)

- `packages/core`(`@taskaror/core`) — ブラウザ / React 非依存の共有コアロジック(`src/lib/`)と型定義(`src/types/`)。tsc ビルドせず TypeScript ソースをそのまま `exports` で公開する内部パッケージ(web は Vite が、将来の CLI はバンドラがソースを直接処理する)。`@taskaror/core/<module>` が `src/lib/<module>.ts`、`@taskaror/core/types/taskspec` が型定義に対応する
- `packages/web`(`@taskaror/web`) — Vite + React 19 + TypeScript の SPA(GUI エディタ)
- `schema/`・`examples/`・`docs/` はルート直下に置く。特に `schema/` は `$id` の URL パスとディレクトリ構造を一致させているため移動しない

### TaskSpec とフォーマット同期

TaskSpec は「仕様」、taskaror は「その実装のひとつ」という関係。仕様と実装が同居しているため、フォーマットを変更するときは以下の 3 箇所を同期させる必要がある:

1. [schema/1.0/taskspec.schema.json](schema/1.0/taskspec.schema.json) — TaskSpec 1.0 の JSON Schema(draft 2020-12)。フォーマットの正。`$id` の URL パス(`schema/1.0/taskspec.schema.json`)とディレクトリ構造を一致させており、バージョン追加時は `schema/<version>/` を新設する。Ajv で検証する場合はデフォルトエクスポートではなく `ajv/dist/2020` の `Ajv2020` を使い、`format: "date"` のために ajv-formats を併用する
2. [packages/core/src/types/taskspec.ts](packages/core/src/types/taskspec.ts) — スキーマと対応する TypeScript 型定義
3. [packages/core/src/lib/taskspec.ts](packages/core/src/lib/taskspec.ts) — parse / serialize / flatten などのコアロジック(現状は最小限の構造チェックのみで、schema.json による完全バリデーションは未実装)

[packages/web/src/App.tsx](packages/web/src/App.tsx) は [examples/ecommerce.taskspec.yaml](examples/ecommerce.taskspec.yaml) を `?raw` インポートして表示するサンプル UI。

## TaskSpec の設計原則(コード変更時に守ること)

- **Single Source of Truth** — YAML に保存するのは人の入力のみ(タスク階層・タスク名・見積工数・依存関係・担当者・進捗・タグ・メモ)。WBS 番号・終了日・クリティカルパス等の導出値はレンダラーが計算する。導出値を保存するフィールドを仕様に追加しない
- **Small Core** — コア仕様は最小限に保つ。組織固有の情報は `x-` プレフィックスの独自拡張で対応する(schema.json の `patternProperties` で許可済み)
- `estimate` は経過時間ではなく工数を表す(例: `1.5d`, `4h`)。日⇔時間の換算は実装定義
- 親子関係は ID 参照ではなく YAML のネスト(`tasks` の入れ子)で表現する
- Non-Goals: リソース管理・勤務カレンダー・コスト管理・EVM・スケジューリングアルゴリズム・UI の挙動は仕様の対象外
