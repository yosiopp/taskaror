# 決定記録

taskaror の実装で採用した決めごとをまとめる。スケジュール導出の規則は
[site/derivation.md](site/derivation.md)、lint のルール仕様は
[site/lint.md](site/lint.md) にあり、ここにはそれ以外の決定を記録する。

## ドキュメントの公開区分

ドキュメントは `docs/` 配下に集約し、公開するものだけを `docs/site/` に置く。

- **`docs/site/` — GitHub Pages で公開する利用者向けドキュメント**(TaskSpec の仕様・
  GUI / CLI の操作方法・スケジュール導出・lint ルールなどのヘルプ)。
  .github/workflows/pages.yml が Jekyll でビルドして公開する
- **`docs/` 直下 — 公開しない開発者向けドキュメント**(開発ルール・設計履歴・開発情報。
  decisions.md と development.md)
- README は概要とリンク集にとどめ、操作方法・仕様の本文は docs/site/ に置く

## GUI(エディタ)

- **「完了」の定義** — `progress === 100` を完了とする。[表示] メニューの
  「完了タスクを非表示」フィルタはこの判定を使う(ビューのフィルタであり、spec は変更しない)。
- **id 自動採番** — UI でタスクを追加したときの id は `t` + 英数字 3 文字
  (`t[a-z0-9]{3}`。例: `ta3f`)のランダム生成とし、タイトルからは生成しない。
  schema の id パターン `^[A-Za-z][A-Za-z0-9._-]*$` に適合する。採番空間は
  36^3 = 46,656 通りのため、衝突時は再生成でよい(連番化はしない)。
- **アイコン** — Material Icons を使用し、自己完結性のためインライン SVG パスで
  埋め込む(Web フォント / CDN は使わない)。
- **アプリ情報の単一ソース** — アプリ名・GitHub リポジトリ URL は
  [packages/web/src/appInfo.ts](../packages/web/src/appInfo.ts)(`REPOSITORY_URL` =
  `https://github.com/yosiopp/taskaror`)を単一のソースとする。バージョンは
  package.json の `version` をビルド時に埋め込む(モノレポでの version の揃え方は
  CLAUDE.md の「バージョン」を参照)。

## CLI・配布(フェーズ 10 で決定)

- **`taskaror` を単一エントリとする(CLI ファースト)** — web(`serve`)も CLI も
  同じコマンドのサブコマンドとして提供する。
- **実行可能バイナリは作らない** — 単一バイナリ化(pkg 等でのネイティブ化)はせず、
  Node.js 実行環境を前提とする。実行経路は npx(npm パッケージの `bin`)と
  Docker(`taskaror` を entrypoint にしたイメージ)の 2 つ。
- **web は静的 SPA のまま** — `serve` は既存の静的 SPA をローカルサーバで配信するだけ。
  spec の保持は localStorage + ダウンロード / アップロードで行い、ファイルの直接編集・
  ボリュームマウントはしない(Docker ではポート公開のみ)。
- **spec を扱うコマンドはファイル引数で受ける** — `validate` / `lint` / `svg` は
  引数で spec ファイルを受け取る。Docker ではカレントディレクトリを `/work` に
  マウントして渡す(例: `docker run --rm -v $PWD:/work taskaror validate task.taskspec.yaml`)。
- **コアの分離方式はモノレポ** — web と CLI を同一リポジトリに同居させ、React 非依存の
  コアロジックを `@taskaror/core` に切り出して双方から参照する(npm workspaces)。
- **compose.yaml の位置づけ** — `dev` / `web` プロファイルは開発・確認用の便宜として残し、
  `taskaror serve` を製品レベルの統一起動コマンドとする。

## スケジュール導出

1d = 8h 固定、土日スキップ、開始日の優先規則、estimate 未指定タスクの
0d マイルストーン扱い、親タスクの包絡と開始下限の伝播などの決めごとと実装定義は
[site/derivation.md](site/derivation.md) にまとめている。
