# CLI の使い方

`taskaror` コマンドは、GUI エディタの配信(`serve`)と、spec ファイルを扱うサブコマンド(`validate` / `lint` / `svg`)を提供します。実行方法は npx と Docker の 2 通りです。

```bash
npx taskaror --help    # 使い方を表示(各サブコマンドは <command> --help)
```

npx 実行には Node.js 20 以上が必要です。

## serve — GUI エディタの配信

```bash
npx taskaror serve                # http://127.0.0.1:5173 で配信
npx taskaror serve --port 8080    # ポートを変更
npx taskaror serve --host 0.0.0.0 # bind 先を変更(既定は 127.0.0.1)
```

配信される web は静的 SPA です。編集内容は localStorage とダウンロード / アップロードで扱うため、ファイルのマウントは不要です。

## validate — spec の検証

```bash
npx taskaror validate task.taskspec.yaml    # 複数ファイルも指定可
```

JSON Schema([schema/1.0/taskspec.schema.json](https://github.com/yosiopp/taskaror/blob/main/schema/1.0/taskspec.schema.json))による検証と、構造の検証(id の重複・`depends` の参照切れ・循環など)を行います。

## lint — 矛盾・怪しい記述の検出

```bash
npx taskaror lint task.taskspec.yaml
```

schema としては正しいが、スケジュール導出の意味論から見て矛盾している・怪しい記述を検出します。ルールの一覧は [lint ルール](lint.md) を参照してください。

## svg — ガントチャート SVG の出力

```bash
npx taskaror svg task.taskspec.yaml                 # 標準出力へ
npx taskaror svg task.taskspec.yaml -o gantt.svg    # ファイルへ(--output でも可)
```

GUI と同じレイアウト計算でガントチャートを SVG として出力します。

## 終了コード

| コード | 意味                                                    |
| ------ | ------------------------------------------------------- |
| 0      | 正常終了(validate / lint は指摘なし)                    |
| 1      | 実行時エラー(検証エラー・lint の warning・読み込み失敗) |
| 2      | 使い方の誤り(不明なコマンド・不正なオプション)          |

`validate` / `lint` は問題を検出すると終了コード 1 を返すため、CI にも組み込めます。

## Docker での実行

`taskaror` を entrypoint にしたイメージを使います。GHCR (GitHub Container Registry) で公開しているイメージ(linux/amd64・linux/arm64 対応)をそのまま pull できます。

```bash
docker pull ghcr.io/yosiopp/taskaror    # 最新リリース(:1.2.3 のようにバージョン指定も可)
```

自分でビルドする場合は次のとおりです(以降の実行例では `ghcr.io/yosiopp/taskaror` を `taskaror` に読み替えてください)。

```bash
docker build --target cli -t taskaror https://github.com/yosiopp/taskaror.git
# あるいはリポジトリのクローン内で: docker build --target cli -t taskaror .
```

実行例:

```bash
docker run --rm ghcr.io/yosiopp/taskaror --help
docker run --rm -p 5173:5173 ghcr.io/yosiopp/taskaror serve

# ファイルを引数に取るコマンドは、カレントディレクトリを /work にマウントして渡す
docker run --rm -v $PWD:/work ghcr.io/yosiopp/taskaror validate task.taskspec.yaml
docker run --rm -v $PWD:/work ghcr.io/yosiopp/taskaror lint task.taskspec.yaml
docker run --rm -v $PWD:/work ghcr.io/yosiopp/taskaror svg task.taskspec.yaml -o gantt.svg
```
