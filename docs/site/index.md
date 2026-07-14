# taskaror ドキュメント

**taskaror** は、YAML ベースのタスク定義フォーマット **TaskSpec** を編集・検証・可視化するためのオープンソースプロジェクトです。ブラウザ上で動くガントチャートエディタと、検証・lint・SVG 出力を行う CLI を提供します。

ソースコードは [GitHub リポジトリ](https://github.com/yosiopp/taskaror) にあります。

## はじめる

```bash
npx taskaror serve    # http://127.0.0.1:5173 で GUI エディタを起動(要 Node.js 20+)
```

Docker でも実行できます。詳しくは [CLI の使い方](cli.md) を参照してください。

## ドキュメント

- [TaskSpec フォーマット](taskspec.md) — YAML フォーマットの仕様(フィールド一覧・拡張性・Non-Goals)
- [GUI エディタの使い方](gui.md) — ガントチャートエディタの操作方法・キーボードショートカット
- [CLI の使い方](cli.md) — `taskaror` コマンド(serve / validate / lint / svg)
- [スケジュール導出ルール](derivation.md) — 開始日・終了日・期間の計算規則
- [lint ルール](lint.md) — `taskaror lint` が検出する矛盾・怪しい記述の仕様

## ヘルプ

- 不具合報告・要望は [GitHub Issues](https://github.com/yosiopp/taskaror/issues) へ
- GUI エディタの [ヘルプ] メニューから GitHub リポジトリとバージョン情報を参照できます
- ライセンスは Apache License 2.0 です([LICENSE](https://github.com/yosiopp/taskaror/blob/main/LICENSE))
