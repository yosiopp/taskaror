# taskaror

**taskaror** は、YAML ベースのタスク定義フォーマット **TaskSpec** を編集・検証・可視化するためのオープンソースプロジェクトです。ブラウザ上で動くガントチャートエディタを備え、GUI で編集した内容をリアルタイムにガントへ反映し、`.taskspec.yaml` として保存できます。

TaskSpec は、人・AI・Git が扱いやすいことを重視した、軽量な WBS（Work Breakdown Structure）・ガントチャート向けデータフォーマットです。taskaror はそのリファレンス実装およびツール群を提供します。

![taskaror のガント編集ビュー。左に編集可能なタスクグリッド、右に SVG ガントチャートを表示](docs/images/screenshot-gantt.png)

## コンセプト

従来の WBS・ガントチャートツールは高機能な一方、独自フォーマットで管理されるため、Git での差分レビューや AI による編集・生成が難しく、Markdown やテキストエディタとの相性も良くありません。taskaror は次のコンセプトでこれらの課題を解決することを目指します。

- **Human First** — 人が直接読み書きできることを最優先に設計
- **AI First** — LLM による WBS 作成・タスク分解・見積り支援・レビューを前提とした構造
- **Git First** — 差分が分かりやすく、Pull Request でのレビュー・マージがしやすい
- **YAML Native** — 親子関係を ID ではなく YAML のネスト構造で自然に表現
- **Single Source of Truth** — 保存するのは人の入力のみ。WBS 番号・終了日・クリティカルパス等はレンダラーが計算し、二重管理を防ぐ
- **Small Core** — コア仕様は最小限に保ち、必要に応じて拡張できる設計

## 主な機能

- **ガントチャートエディタ** — 左は編集可能なタスクグリッド（インライン編集・行選択・階層の展開/折りたたみ）、右は自前の SVG ガント。左右は行が揃い、境界をドラッグしてペイン幅を変更できます。
- **スケジュール自動導出** — 見積工数（`1.5d` / `4h`、1d = 8h）・依存（`depends`）・営業日（土日スキップ）から開始日・終了日を計算します。親タスクはサマリーバー、見積のない子タスクは 0d のマイルストーン（ひし形）として描画し、今日線と依存矢印を表示します。導出値は保存しません（Single Source of Truth）。
- **ナビゲーション** — 2 行構成のヘッダ。1 行目はアプリ名・プロジェクトタイトル・メニューバー（ファイル / 編集 / 表示）、2 行目は Material Icons のツールバー（タスク追加・削除・アウトデント／インデント・上下移動）です。メニューは外側クリック・Esc・キーボード操作に対応します。
- **編集操作** — ツールバーでの追加・削除・階層変更・上下移動に加え、ドラッグ&ドロップでの階層移動、バーのドラッグで開始日、右端のドラッグで見積を変更できます。タスクをダブルクリックすると全フィールド（title / estimate / start / 担当 / 依存 / 進捗 / タグ / メモ）を編集できるダイアログが開き、グリッド下部の空行クリックで新規タスクを追加できます（スプレッドシート風）。
- **依存関係の入力** — 既存タスクからの選択式（グリッドのポップオーバー・編集ダイアログ）に加え、ガント上でバー端の接続ハンドルから対象バーへドラッグしても設定できます。自分自身・子孫・祖先・循環になる向きは候補から除外し、論理的な循環を防ぎます。
- **キーボード操作 / アクセシビリティ** — セル編集（Enter / Tab / Esc）、↑ / ↓ での行フォーカス移動、ガントバーの Tab フォーカスと矢印キー操作、メニューバーの矢印キー操作、Undo / Redo（Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z、Ctrl+Y）に対応。タスク操作はショートカットでも実行できます（Insert=追加、Delete=削除、Ctrl+↑ / ↓=上下移動、Ctrl+→ / ←=インデント / アウトデント）。メニュー項目・ツールバーのツールチップにショートカットを併記します。
- **ビュー切り替え** — 表示メニューから ガントチャート / YAML テキストビュー（編集して「適用」でモデルへ反映）/ WBS 番号付きテーブルビュー を切り替えられます。
- **ファイル入出力** — 新規作成、`.taskspec.yaml` としてのダウンロード保存、ファイル選択＋ドラッグ&ドロップでの読み込み、パース／検証エラーの表示、localStorage への自動保存（リロードで作業が消えません）。
- **YAML の忠実性** — 読み込んだ YAML の未変更部分について、コメント・キー順・引用符スタイルを保持します（yaml の Document API を利用）。
- **その他** — クリティカルパスのハイライト、完了タスク（進捗 100%）の非表示フィルタ、SVG / PNG エクスポート、遠い未来日でも軽快に動く日カラムの仮想化。

## スクリーンショット

WBS 番号付きテーブルビュー。WBS 番号・開始日・終了日などの導出値を一覧できます。

![WBS 番号付きテーブルビュー。WBS 番号・タスク名・期間を表形式で表示](docs/images/screenshot-wbs.png)

YAML テキストビュー。YAML を直接編集し「適用」でモデルへ反映できます。

![YAML テキストビュー。TaskSpec の YAML をテキストエリアで直接編集](docs/images/screenshot-yaml.png)

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

## 使い方 / 開発

Node.js（推奨: v24 系）と npm が必要です。

```bash
# 依存関係のインストール
npm install

# 開発サーバーを起動(Vite / HMR、http://localhost:5173)
npm run dev

# 本番ビルド(tsc -b && vite build。出力は dist/)
npm run build

# ビルド成果物のプレビュー
npm run preview
```

### テスト・静的解析

コアロジック（検証・スケジュール導出・ガントのレイアウト計算）は Vitest でテストしています。

```bash
npm run test          # Vitest(1 回実行)
npm run test:watch    # Vitest(watch モード)

npm run typecheck     # 型チェック(tsc -b)
npm run lint          # ESLint
npm run lint:fix      # ESLint(自動修正)
npm run format        # Prettier(整形)
npm run format:check  # Prettier(チェックのみ)
```

### Docker

Docker でも開発サーバーの起動と本番ビルドの確認ができます。

```bash
# 開発用: Vite dev server(http://localhost:5173)
docker compose up dev

# 本番ビルド確認: nginx で dist を配信(http://localhost:8080)
docker compose --profile prod up web --build
```

## アーキテクチャ

Vite + React 19 + TypeScript の SPA です。将来的に CLI（linter / validator / SVG ガント出力）へ展開できるよう、コアロジック（検証・スケジュール導出・ガントのレイアウト計算）はブラウザ / React 非依存の純粋な TypeScript として `src/lib` に実装しています。

CLI 化にあたっては、web と CLI を同一リポジトリに同居させるモノレポ構成（npm workspaces を基本線）へ移行し、共有コアを独立パッケージへ切り出す予定です。実行は `taskaror` を単一エントリとし、npx（`npx taskaror <command>`）または Docker（`docker run … taskaror <command>`）から行えるようにします（ネイティブバイナリ化はしません）。web の GUI も `taskaror serve` で起動する静的 SPA として提供し（従来どおり localStorage + ダウンロード/アップロードで、ファイルの直接編集はしません）、`validate` / `lint` / `svg` などのサブコマンドは spec ファイルを引数に取ります。

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

Apache License 2.0 のもとで公開しています。詳細はリポジトリ同梱の [LICENSE](LICENSE) を参照してください。
