# taskaror

**taskaror** は、YAML ベースのタスク定義フォーマット **TaskSpec** を編集・検証・可視化するためのオープンソースプロジェクトです。

TaskSpec は、人・AI・Git が扱いやすいことを重視した、軽量な WBS（Work Breakdown Structure）・ガントチャート向けデータフォーマットです。taskaror はそのリファレンス実装およびツール群を提供します。

## コンセプト

従来の WBS・ガントチャートツールは高機能な一方、独自フォーマットで管理されるため、Git での差分レビューや AI による編集・生成が難しく、Markdown やテキストエディタとの相性も良くありません。taskaror は次のコンセプトでこれらの課題を解決することを目指します。

- **Human First** — 人が直接読み書きできることを最優先に設計
- **AI First** — LLM による WBS 作成・タスク分解・見積り支援・レビューを前提とした構造
- **Git First** — 差分が分かりやすく、Pull Request でのレビュー・マージがしやすい
- **YAML Native** — 親子関係を ID ではなく YAML のネスト構造で自然に表現
- **Single Source of Truth** — 保存するのは人の入力のみ。WBS 番号・終了日・クリティカルパス等はレンダラーが計算し、二重管理を防ぐ
- **Small Core** — コア仕様は最小限に保ち、必要に応じて拡張できる設計

## TaskSpec

TaskSpec は taskaror が採用する YAML ベースの仕様です。

```yaml
taskspec: '1.0'

info:
  title: ECサイト構築

tasks:
  - id: design
    title: 設計
    tasks:
      - id: api
        title: API設計
        estimate: 1.5d
      - id: db
        title: DB設計
        estimate: 4h

  - id: implementation
    title: 実装
    depends:
      - design
```

保持する情報は、タスク階層・タスク名・見積工数・依存関係・担当者・進捗・タグ・メモのみ。これ以外はレンダラーが導出します。

### 拡張性

`x-` プレフィックスによる独自拡張をサポートします。標準仕様との互換性を保ったまま、組織固有の情報を追加できます。

```yaml
tasks:
  - id: api
    title: API設計
    x-ticket: DEV-123
    x-reviewer: tanaka
```

### 対象外（Non-Goals）

リソース管理・勤務カレンダー・コスト管理・EVM・ポートフォリオ管理・スケジューリングアルゴリズム・UI の挙動は仕様の対象外とし、各実装や周辺ツールの責務とします。

## 提供予定のツール群

- TaskSpec JSON Schema / バリデーター / Linter / Formatter
- CLI
- WBS・ガントチャートレンダラー
- Markdown（Remark）プラグイン
- VS Code 拡張 / Language Server Protocol (LSP)
- エクスポート（HTML / Excel / CSV / Mermaid）

## TaskSpec と taskaror の関係

TaskSpec は仕様であり、taskaror はその仕様を実装した OSS のひとつです。将来的には他言語・他プラットフォームによる実装が生まれることを歓迎します。

## ライセンス

Apache License 2.0
