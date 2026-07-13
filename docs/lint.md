# lint ルール仕様

`taskaror lint` は、schema・構造としては valid な TaskSpec に対して、
スケジュール導出の意味論([derivation.md](derivation.md))から見て怪しい・矛盾している記述を
検出する助言ツール。検出ロジックは
[packages/core/src/lib/lint.ts](../packages/core/src/lib/lint.ts)(React 非依存の純ロジック)、
CLI は [packages/cli/src/commands/lint.ts](../packages/cli/src/commands/lint.ts) にある。

## validate との役割分担

- **`taskaror validate`** — spec が TaskSpec として**成立しているか**を検証する。
  JSON Schema 検証(型・必須項目・値の形式・バージョン)と構造検証
  (id の重複・depends の参照先不在・依存の循環)を担う。
  これらは error であり、成立していない spec はスケジュール導出の前提を満たさない。
- **`taskaror lint`** — validate を通過した spec を対象に、
  **導出の意味論から見て矛盾している・誤解を招く記述**を検出する。
  validate が検出する内容を lint で重複して検査することはしない。

lint はこの前提のため、実行前に validate 相当の検証を行い、エラーがあれば
lint せずに「先に validate を通すこと」を促して終了する(exit 1)。

## 重大度と終了コード

| 重大度    | 意味                                                                      | 終了コードへの影響 |
| --------- | ------------------------------------------------------------------------- | ------------------ |
| `warning` | 導出の意味論と矛盾している。書かれた値が無視される、または成立しない記述  | 1 件以上で exit 1  |
| `info`    | 誤りではないが、YAML 上の値と導出結果がずれるなど、知らせる価値のある記述 | 影響しない         |

- 指摘なし・info のみ → **exit 0**(CI を通す)
- warning 1 件以上 → **exit 1**(CI を落とす)
- ファイルが読めない・パースできない・validate 相当のエラー → exit 1
- 引数の誤り(ファイル未指定など) → exit 2

error 級の重大度は設けない(成立しない spec の検出は validate の領分)。

なお、すべてのルールは明示された入力(start・estimate・depends・progress)にのみ反応するため、
**lint の結果は実行日に依存しない**(明示 start が 1 つもない spec では日付系ルールは発火しない)。

## 用語

derivation.md の導出規則から、次の記法を使う。

- **調整後 start** — 明示 start が土日なら翌営業日にずらした日。
- **successorStart(P)** — 先行タスク P の後続が開始できる最早日。
  P が 0d マイルストーンなら P の終了日と**同日**、それ以外は P の終了日の**翌営業日**。
- **開始下限** — タスクが開始できる最早日。祖先の start・depends は子孫全体の開始下限として
  伝播する。子自身の明示 start はこれより**優先される**ため、下限と矛盾した値も書けてしまう
  (この矛盾の検出が lint の主目的)。

## ルール一覧

| ID                             | 重大度  | 概要                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------ |
| `parent-estimate`              | warning | 子を持つタスクに estimate が指定されている                   |
| `start-before-parent`          | warning | 明示 start が祖先から伝播する開始下限より前                  |
| `start-before-depends`         | warning | 明示 start が自タスクの depends から導かれる開始可能日より前 |
| `hierarchy-depends`            | warning | depends が自分の祖先または子孫を指している                   |
| `completed-before-predecessor` | warning | progress 100 のタスクの先行タスクが未完了                    |
| `weekend-start`                | info    | 明示 start が土日                                            |

### parent-estimate(warning)

**検出条件**: 子タスク(`tasks`)を 1 つ以上持つタスクに `estimate` が指定されている。

親タスクの期間は子の包絡(最早開始〜最遅終了)で決まり、親自身の estimate は
スケジュール導出に使われない。書かれた値はガントに反映されず、読む人を誤解させる。

NG 例:

```yaml
tasks:
  - id: design
    title: 設計
    estimate: 3d # NG: 子を持つため導出に使われない
    tasks:
      - id: api
        title: API設計
        estimate: 1.5d
```

修正例(estimate を削除するか、子タスクへ移す):

```yaml
tasks:
  - id: design
    title: 設計
    tasks:
      - id: api
        title: API設計
        estimate: 1.5d
      - id: db
        title: DB設計
        estimate: 1.5d
```

**根拠**: tasks.md 実装定義「親タスク(子を持つタスク)の期間は子の包絡(最早開始〜最遅終了)。
親自身の estimate はスケジュール導出には使わない」。

### start-before-parent(warning)

**検出条件**: 明示 start を持つタスクについて、調整後 start が
**祖先(親の start・depends)から伝播する開始下限**より前。

導出では子の明示 start が祖先の下限より優先されるため、この矛盾があると
子が親の開始下限より前に描かれ、親バーは子を包絡して意図より前へ伸びる。

NG 例(親の start より前):

```yaml
tasks:
  - id: phase2
    title: フェーズ2
    start: '2026-07-20'
    tasks:
      - id: impl
        title: 実装
        start: '2026-07-15' # NG: 親の start(2026-07-20)より前
        estimate: 2d
```

修正例(子の start を下限以降にするか、削除して伝播に任せる):

```yaml
tasks:
  - id: phase2
    title: フェーズ2
    start: '2026-07-20'
    tasks:
      - id: impl
        title: 実装
        estimate: 2d
```

親が depends を持つ場合は「先行タスクの successorStart」が下限になる(下の
`start-before-depends` と同じ計算)。比較は調整後 start で行うため、
土日の start が営業日調整の結果として下限以降に収まる場合は指摘しない。

**根拠**: tasks.md 実装定義「親の start・depends は子孫全体の開始下限として伝播する。
子自身の明示 start はそれより優先する(矛盾の検出は将来の linter で扱う)」。

### start-before-depends(warning)

**検出条件**: 明示 start と depends の両方を持つタスクについて、調整後 start が
自タスクの depends から導かれる開始可能日(各先行の successorStart の最大)より前。

導出では明示 start が優先されるため、この矛盾があると依存制約は事実上無視され、
先行タスクの完了前に後続が始まるガントが描かれる。

NG 例:

```yaml
tasks:
  - id: design
    title: 設計
    start: '2026-07-13' # 月曜。3d → 2026-07-15(水)終了
    estimate: 3d
  - id: impl
    title: 実装
    start: '2026-07-14' # NG: design の完了から導かれる開始可能日(2026-07-16)より前
    estimate: 2d
    depends:
      - design
```

修正例(start を開始可能日以降にするか、削除して依存からの導出に任せる):

```yaml
tasks:
  - id: design
    title: 設計
    start: '2026-07-13'
    estimate: 3d
  - id: impl
    title: 実装
    estimate: 2d
    depends:
      - design
```

境界: 先行が 0d マイルストーンの場合は**同日開始**が正しい導出のため、
同日の start は指摘しない。複数の depends がある場合は最も遅い先行と比較する。

**根拠**: tasks.md 実装定義「depends を持つタスクは先行タスクの終了日の翌営業日から開始する。
ただし先行が 0d(マイルストーン)の場合は同日から開始する」と、
明示 start が優先される導出規則(derivation.md「開始日」)の組み合わせ。

### hierarchy-depends(warning)

**検出条件**: `depends` の参照先が自分自身の**祖先**または**子孫**。

祖先の期間は自分(子孫)を包絡するため、「祖先の完了後に自分が始まる」
「自分の完了後に祖先が始まる」は定義上成立しない。schedule はこの入力を
異常な循環としてフォールバック(プロジェクト最早 start で打ち切り)で処理するため、
意図しない結果になる。GUI(web)もこの向きの依存設定を禁止している。

NG 例:

```yaml
tasks:
  - id: design
    title: 設計
    tasks:
      - id: api
        title: API設計
        estimate: 1d
        depends:
          - design # NG: 自分の親(祖先)への依存
```

修正例(依存は別サブツリーの先行タスクへ張る):

```yaml
tasks:
  - id: design
    title: 設計
    tasks:
      - id: api
        title: API設計
        estimate: 1d
  - id: impl
    title: 実装
    estimate: 2d
    depends:
      - design
```

補足: 自分自身への依存(`depends: [自分の id]`)は依存の循環として validate が検出するため、
lint の対象外。depends のみで構成される循環も同様に validate の領分。

**根拠**: tasks.md 実装定義「親タスク(子を持つタスク)の期間は子の包絡」および
schedule 実装の循環フォールバック(derivation.md「異常系」)。

### completed-before-predecessor(warning)

**検出条件**: `progress: 100` のタスクが depends を持ち、その先行タスク
(先行がサマリーの場合はその子孫を含む)に「progress が明示されていて 100 未満」の
タスクがある。

依存の意味論では後続は先行の終了後に開始するため、後続が完了しているのに
先行が未完了なのは矛盾している(依存が過剰か、progress の記入漏れ・誤り)。

progress 未指定のタスクは「進捗不明」として扱い、検出しない(誤検知を避ける)。
先行がサマリータスクの場合、その終了日は子孫の最遅終了で決まるため、
子孫に明示 progress < 100 のタスクがあれば矛盾とみなす。

NG 例:

```yaml
tasks:
  - id: design
    title: 設計
    estimate: 2d
    progress: 60
  - id: impl
    title: 実装
    estimate: 3d
    progress: 100 # NG: 未完了(progress 60)の design に依存している
    depends:
      - design
```

修正例(先行の progress を実態に合わせるか、依存を見直す):

```yaml
tasks:
  - id: design
    title: 設計
    estimate: 2d
    progress: 100
  - id: impl
    title: 実装
    estimate: 3d
    progress: 100
    depends:
      - design
```

**根拠**: 依存の導出規則(tasks.md 実装定義「depends を持つタスクは先行タスクの
終了日の翌営業日から開始する」)が表す先行→後続の順序関係。

### weekend-start(info)

**検出条件**: 明示 start が土曜日または日曜日。

導出は開始日を自動で翌営業日にずらすため誤りではないが、YAML 上の値と
描画される開始日がずれる。意図した日付か確認を促す。

NG 例:

```yaml
tasks:
  - id: kickoff
    title: キックオフ
    start: '2026-07-18' # info: 土曜日。導出では 2026-07-20(月)開始になる
    estimate: 1d
```

修正例:

```yaml
tasks:
  - id: kickoff
    title: キックオフ
    start: '2026-07-20'
    estimate: 1d
```

**根拠**: tasks.md 実装定義「開始日が土日に当たる場合は翌営業日にずらす」。

## 検討して不採用としたルール

- **depends の重複要素** — schema の `uniqueItems` 違反として validate が検出する(重複させない)。
- **親タスクへの progress・assignees の指定** — 人の入力として正当(web の完了タスク非表示
  フィルタなどで使う)。導出とも矛盾しない。
- **`estimate: 0d` の明示** — 0d マイルストーンの正当な表現(estimate 省略と同義)。
- **過去日の start** — 進行中のプロジェクトでは通常の状態であり、矛盾ではない。

## CLI の挙動

```
taskaror lint <ファイル>...
```

- spec ファイルを 1 つ以上指定する。0 個なら使い方エラー(exit 2)。
- ファイルごとに validate 相当の検証を行い、エラーがあれば lint せずに
  「先に validate を通すこと」を促すメッセージを出す(exit 1)。
- 指摘は「タスクの位置(パスと id): ルール ID: メッセージ」形式で 1 件 1 行、
  重大度を添えて列挙し、先頭にサマリ行を出す。指摘がなければ `OK` 1 行。

出力例:

```
$ taskaror lint plan.taskspec.yaml
plan.taskspec.yaml: 2 件の指摘があります(warning 1 件・info 1 件)
  [warning] tasks[0] (design): parent-estimate: 子を持つタスクの estimate("3d")はスケジュール導出に使われません(親の期間は子の包絡で決まります)
  [info] tasks[1] (kickoff): weekend-start: start(2026-07-18)は土曜日のため、導出では翌営業日(2026-07-20)から開始します
```
