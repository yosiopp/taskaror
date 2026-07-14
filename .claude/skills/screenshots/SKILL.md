---
name: screenshots
description: ドキュメント用スクリーンショット(docs/site/docs/images のガント / WBS表 / YAML)を現行 UI で撮り直す手順。GUI を headless Chrome(playwright-core)で起動・操作して撮影・目視検証する。UI 変更後のスクショ更新や、GUI を実際に起動しての動作確認に使う。
---

# ドキュメント用スクリーンショットの撮り直し

docs/site/docs/images/ の 3 枚(screenshot-gantt.png / screenshot-wbs.png / screenshot-yaml.png)を
現行 UI で撮り直す。README とドキュメントサイト(docs/site/docs/gui.md)の両方から参照されている。

## 前提

- システムに Google Chrome がインストールされていること(`ls /Applications/ | grep -i chrome`)。
  playwright-core の `channel: 'chrome'` でシステムの Chrome を使うため、ブラウザのダウンロードは不要
- playwright-core はルートの devDependencies にあり、`npm install` 済みなら追加セットアップ不要
- ポート 5173 が空いていること(`lsof -i :5173 -sTCP:LISTEN`)

## 手順

```bash
# 1. dev サーバをバックグラウンド起動し、200 が返るまで待つ
npm run dev > /tmp/taskaror-dev.log 2>&1 &
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ | grep -q 200; do sleep 1; done

# 2. 撮影(出力先ディレクトリを引数で渡す。省略時はカレントの shots/)
node .claude/skills/screenshots/screenshots.mjs <出力先ディレクトリ>

# 3. 撮影した 3 枚を Read ツールで必ず目視確認する(下記チェックリスト)

# 4. 問題なければ差し替えてサイズ確認
cp <出力先>/screenshot-{gantt,wbs,yaml}.png docs/site/docs/images/
sips -g pixelWidth -g pixelHeight docs/site/docs/images/*.png   # 1440x640 のはず

# 5. dev サーバを停止してコミット
lsof -ti :5173 | xargs kill
```

## 目視確認のチェックリスト(白画面や旧 UI なら失敗)

- gantt: 2 行ヘッダ(メニューバー: ファイル / 編集 / 表示 / ヘルプ+アイコンツールバー)、
  タスクグリッドの下に空グリッド行、ガント側に今日線・サマリーバー・マイルストーン(ひし形)
- wbs: WBS 番号列と導出値(開始・終了)が表示されている
- yaml: 「適用」ボタンとサンプル spec の YAML が表示されている

## ハマりどころ(スクリプトが前提にしていること)

- サンプル spec(ECサイト構築)は localStorage が空のときだけ読み込まれる。
  headless Chrome は毎回新規プロファイルなので常に空になり、問題にならない
- メニューバーのロールはトップレベルが `menuitem`、ビュー切替の項目が `menuitemradio`。
  UI のロールを変えたらスクリプトのセレクタも直すこと
- viewport は 1440x640・deviceScaleFactor 1(既存画像とサイズを揃える)
- 例 spec は start を持たないため、開始日は「今日」に導出される。日付が写るのは仕様どおり
