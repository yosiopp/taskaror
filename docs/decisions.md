# 決定記録

taskaror の実装で採用した決めごとをまとめる。スケジュール導出の規則は
[site/docs/derivation.md](site/docs/derivation.md)、lint のルール仕様は
[site/docs/lint.md](site/docs/lint.md) にあり、ここにはそれ以外の決定を記録する。

## ドキュメントの公開区分

ドキュメントは `docs/` 配下に集約し、公開するものだけを `docs/site/` に置く。

- **`docs/site/` — GitHub Pages で公開する利用者向けドキュメント**(TaskSpec の仕様・
  GUI / CLI の操作方法・スケジュール導出・lint ルールなどのヘルプ)。
  Rspress のワークスペース(`@taskaror/docs`)で、コンテンツは `docs/site/docs/` 配下。
  .github/workflows/pages.yml が Rspress でビルドして公開する
  (当初は Jekyll。React/npm 構成への統一と SPA 同居のため Rspress に移行した)
- **`docs/` 直下 — 公開しない開発者向けドキュメント**(開発ルール・設計履歴・開発情報。
  decisions.md と development.md)
- README は概要とリンク集にとどめ、操作方法・仕様の本文は docs/site/ に置く

## 導出値は保存しない(Single Source of Truth)

YAML に保存するのは人の入力のみとし、導出値(スケジュールの開始日・終了日、
WBS 番号、クリティカルパス、ガントの座標など)は保存せず、コアの純粋関数
(schedule / wbs / critical / gantt など)が表示・出力のたびに計算する。
入力と導出値の二重管理を防ぐためで、導出値を保存するフィールドは仕様に追加しない
(CLAUDE.md の「TaskSpec の設計原則」、利用者向けの説明は
[site/docs/derivation.md](site/docs/derivation.md) を参照)。
この方針は全体に適用されるため、各ソースコメントには個別に書かない。

## 除外日(info.holidays)はコア仕様に含める

祝日・会社休業日など「営業日から除外する日付のリスト」は `info.holidays`
(`YYYY-MM-DD` の配列)としてコア仕様に置き、`x-` 拡張にはしない。
除外日は人の入力(組織の決めごと)であり導出値ではないため、Single Source of
Truth と両立する。導出・描画では土日と同様に扱う(専用の色分けはしない)。

Non-Goals の「勤務カレンダー」は担当者ごとの稼働時間・シフトなどリソース別
カレンダーを指し、プロジェクト共通の除外日リストはそれに当たらないと整理した。
週末定義の変更(週休 1 日など)や `calendar` オブジェクトへの構造化は、
Non-Goals との線引きが崩れるため採用しない。GUI での holidays 編集は
YAML ビューで行う(専用 UI は将来検討)。

## GUI(エディタ)

- **「完了」の定義** — `progress === 100` を完了とする。[表示] メニューの
  「完了タスクを非表示」フィルタはこの判定を使う(ビューのフィルタであり、spec は変更しない)。
- **id 自動採番** — UI でタスクを追加したときの id は `t` + 英数字 3 文字
  (`t[a-z0-9]{3}`。例: `ta3f`)のランダム生成とし、タイトルからは生成しない。
  schema の id パターン `^[A-Za-z][A-Za-z0-9._-]*$` に適合する。採番空間は
  36^3 = 46,656 通りのため、衝突時は再生成でよい(連番化はしない)。
- **アイコン** — Material Icons を使用し、自己完結性のためインライン SVG パスで
  埋め込む(Web フォント / CDN は使わない)。
- **アプリアイコン** — ヘッダではアプリ名のテキストの代わりにアプリアイコン
  ([packages/web/src/components/AppIcon.tsx](../packages/web/src/components/AppIcon.tsx))を
  表示する。インライン SVG を currentColor で描き、ライト / ダークの文字色に追従させる。
  ファビコン(web・ドキュメントサイト共通の favicon.svg)は単体で表示されるため、
  SVG 内の `prefers-color-scheme` で色を切り替える。ドキュメントサイトのナビバーは
  テーマをサイト側のトグルで切り替えるので、色を固定した logo-light.svg / logo-dark.svg を
  出し分ける。同じ図形を複数ファイルに持つため、アイコンを変えるときはすべて揃える。
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
- **PNG / PDF 出力はシステムのブラウザで変換する** — `png` / `pdf` コマンドは、
  `svg` と同じ SVG を HTML に包み、インストール済みの Chrome / Chromium / Edge を
  ヘッドレス起動(`--screenshot` / `--print-to-pdf`)して変換する。ランタイム依存
  ゼロ方針を守るためで、ネイティブモジュール(resvg / sharp 等)や puppeteer は
  採用しない(単一 CJS バンドルに同梱できず、依存ゼロが崩れるため)。探索順は
  環境変数 `TASKAROR_CHROME` → 既知のインストール先 → PATH。Chrome は環境に
  よって変換後もプロセスが終了しない(macOS の Chrome 150 で確認)ため、
  「出力ファイルが現れてサイズが安定したこと」を成功条件とし、こちらから終了させる
  ([packages/cli/src/chrome.ts](../packages/cli/src/chrome.ts))。ブラウザを
  同梱しない Docker イメージでは `png` / `pdf` は使えない(ドキュメントに明記)。

## スケジュール導出

1d = 8h 固定、土日スキップ、開始日の優先規則、estimate 未指定タスクの
0d マイルストーン扱い、親タスクの包絡と開始下限の伝播などの決めごとと実装定義は
[site/docs/derivation.md](site/docs/derivation.md) にまとめている。
