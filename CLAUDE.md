# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

taskaror は、YAML ベースのタスク定義フォーマット **TaskSpec** を編集・検証・可視化するための OSS(リファレンス実装)。Vite + React 19 + TypeScript の SPA。

- プロジェクト名は常に小文字の「taskaror」。文頭・見出しでも大文字にしない。「TaskSpec」はそのまま表記する。
- ドキュメント・コードコメント・UI 文言・エラーメッセージは日本語で書く。

## コマンド

```bash
npm run dev           # Vite dev server (HMR)
npm run build         # tsc -b && vite build
npm run typecheck     # tsc -b(型チェックのみ)
npm run lint          # ESLint
npm run lint:fix
npm run format        # Prettier(セミコロンなし・シングルクォート)
npm run format:check
```

テストはまだ存在しない(test スクリプト未定義)。

### Docker

Docker は colima 経由で動く環境。docker コマンドが失敗したら `colima start` を提案する(勝手に起動しない)。

```bash
docker compose up dev                      # 開発用 (port 5173)
docker compose --profile prod up web --build  # 本番ビルド確認: nginx で dist 配信 (port 8080)
```

## アーキテクチャ

TaskSpec は「仕様」、taskaror は「その実装のひとつ」という関係。仕様と実装が同居しているため、フォーマットを変更するときは以下の 3 箇所を同期させる必要がある:

1. [schema/1.0/taskspec.schema.json](schema/1.0/taskspec.schema.json) — TaskSpec 1.0 の JSON Schema(draft 2020-12)。フォーマットの正。`$id` の URL パス(`schema/1.0/taskspec.schema.json`)とディレクトリ構造を一致させており、バージョン追加時は `schema/<version>/` を新設する。Ajv で検証する場合はデフォルトエクスポートではなく `ajv/dist/2020` の `Ajv2020` を使い、`format: "date"` のために ajv-formats を併用する
2. [src/types/taskspec.ts](src/types/taskspec.ts) — スキーマと対応する TypeScript 型定義
3. [src/lib/taskspec.ts](src/lib/taskspec.ts) — parse / serialize / flatten などのコアロジック(現状は最小限の構造チェックのみで、schema.json による完全バリデーションは未実装)

[src/App.tsx](src/App.tsx) は [examples/ecommerce.taskspec.yaml](examples/ecommerce.taskspec.yaml) を `?raw` インポートして表示するサンプル UI。

## TaskSpec の設計原則(コード変更時に守ること)

- **Single Source of Truth** — YAML に保存するのは人の入力のみ(タスク階層・タスク名・見積工数・依存関係・担当者・進捗・タグ・メモ)。WBS 番号・終了日・クリティカルパス等の導出値はレンダラーが計算する。導出値を保存するフィールドを仕様に追加しない
- **Small Core** — コア仕様は最小限に保つ。組織固有の情報は `x-` プレフィックスの独自拡張で対応する(schema.json の `patternProperties` で許可済み)
- `estimate` は経過時間ではなく工数を表す(例: `1.5d`, `4h`)。日⇔時間の換算は実装定義
- 親子関係は ID 参照ではなく YAML のネスト(`tasks` の入れ子)で表現する
- Non-Goals: リソース管理・勤務カレンダー・コスト管理・EVM・スケジューリングアルゴリズム・UI の挙動は仕様の対象外
