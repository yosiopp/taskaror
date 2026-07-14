# TaskSpec フォーマット

TaskSpec は taskaror が採用する YAML ベースのタスク定義フォーマットです。人・AI・Git が扱いやすいことを重視し、保存するのは人の入力のみ(Single Source of Truth)。開始日・終了日・WBS 番号などの導出値は保存せず、レンダラーが計算します([スケジュール導出ルール](derivation.md))。

JSON Schema は [schema/1.0/taskspec.schema.json](https://github.com/yosiopp/taskaror/blob/main/schema/1.0/taskspec.schema.json) が正です。サンプルは [examples/](https://github.com/yosiopp/taskaror/tree/main/examples) にあります。

## 例

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
        assignees: [tanaka]
      - id: db
        title: DB設計
        estimate: 4h

  - id: implementation
    title: 実装
    depends:
      - design
```

親子関係は ID 参照ではなく `tasks` の入れ子(YAML のネスト)で表現します。

## トップレベル

| フィールド   | 必須 | 説明                              |
| ------------ | ---- | --------------------------------- |
| `taskspec`   | ✓    | フォーマットのバージョン。`'1.0'` |
| `info.title` |      | プロジェクトのタイトル            |
| `tasks`      | ✓    | ルートタスクの配列                |

## タスクのフィールド

| フィールド  | 必須 | 型 / 形式                        | 説明                                                                         |
| ----------- | ---- | -------------------------------- | ---------------------------------------------------------------------------- |
| `id`        | ✓    | `^[A-Za-z][A-Za-z0-9._-]*$`      | タスクの一意な識別子。`depends` から参照される                               |
| `title`     | ✓    | 文字列                           | タスク名                                                                     |
| `estimate`  |      | `1.5d` / `4h` など(`数値 + h/d`) | 見積**工数**(経過時間ではない)。日⇔時間の換算は実装定義(taskaror は 1d = 8h) |
| `start`     |      | `YYYY-MM-DD`                     | 開始予定日。未指定時の規則は[導出ルール](derivation.md)を参照                |
| `depends`   |      | id の配列                        | 先行タスクの id。先行の完了後に開始する                                      |
| `assignees` |      | 文字列の配列                     | 担当者                                                                       |
| `progress`  |      | 0〜100 の数値                    | 進捗率。taskaror は 100 を「完了」とみなす                                   |
| `tags`      |      | 文字列の配列                     | タグ                                                                         |
| `note`      |      | 文字列(Markdown)                 | メモ                                                                         |
| `tasks`     |      | タスクの配列                     | 子タスク。子を持つタスクはサマリーとなり、期間は子の包絡から導出される       |

`estimate` のない子なしタスクは 0d のマイルストーンとして扱われます。

## 拡張性

`x-` プレフィックスによる独自拡張をサポートします。標準仕様との互換性を保ったまま、組織固有の情報を追加できます。

```yaml
tasks:
  - id: api
    title: API設計
    x-ticket: DEV-123
    x-reviewer: tanaka
```

## 対象外(Non-Goals)

リソース管理・勤務カレンダー・コスト管理・EVM・ポートフォリオ管理・スケジューリングアルゴリズム・UI の挙動は仕様の対象外とし、各実装や周辺ツールの責務とします。

## TaskSpec と taskaror の関係

TaskSpec は仕様であり、taskaror はその仕様を実装した OSS のひとつです。将来的には他言語・他プラットフォームによる実装が生まれることを歓迎します。
