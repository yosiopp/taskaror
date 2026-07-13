// validate / lint 共通の「複数 spec ファイルを順に処理する」コマンドの骨組み。
// 引数解釈(--help 含む)→ 引数ゼロエラー → ファイルごとの処理 → 集計サマリ →
// 終了コードまでを一本化し、コマンド固有の文言・処理は定義側から渡す。
import { parseArgs } from 'node:util'

/** 1 ファイルの処理結果 */
export interface FileOutcome {
  /** 成功扱い(exit 0 の対象)か。lint では「エラーなし・warning なし」(info は許容) */
  ok: boolean
  /** 指摘・問題がひとつもなかったか(サマリ文言の判定に使う) */
  clean: boolean
}

/** コマンド固有の文言・処理の定義 */
export interface FilesCommandDefinition {
  /** エラーメッセージ・使い方に表示するコマンド名(validate / lint) */
  name: string
  /** --help で表示する使い方の文面 */
  usage: string
  /** ファイル指定なしのときの 1 行目のエラーメッセージ */
  noFilesMessage: string
  /** サマリ「N ファイル中 M ファイルに◯◯があります」の◯◯(問題 / 指摘) */
  failNoun: string
  /** 1 ファイルを処理して結果を返す(結果の表示は処理側が行う) */
  processFile: (file: string) => FileOutcome
}

/** 複数 spec ファイルを順に処理するコマンドの本体。終了コードを返す */
export function runFilesCommand(
  definition: FilesCommandDefinition,
  argv: string[],
): number {
  let files: string[]
  let help: boolean | undefined
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    })
    files = parsed.positionals
    help = parsed.values.help
  } catch (err) {
    console.error(
      `エラー: ${definition.name} の引数を解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (help === true) {
    console.log(definition.usage)
    return 0
  }
  if (files.length === 0) {
    console.error(definition.noFilesMessage)
    console.error(`使い方: taskaror ${definition.name} <ファイル>...`)
    return 2
  }

  const results = files.map((file) => definition.processFile(file))
  const failedCount = results.filter((result) => !result.ok).length
  // 複数ファイルを処理したときは最後に集計を出す
  if (files.length > 1) {
    if (failedCount > 0) {
      console.error(
        `${files.length} ファイル中 ${failedCount} ファイルに${definition.failNoun}があります`,
      )
    } else if (results.every((result) => result.clean)) {
      console.log(`${files.length} ファイルすべて OK`)
    } else {
      // ok だが指摘ありのファイルがあるとき(lint の info のみ)は「すべて OK」とは言わない
      console.log(
        `${files.length} ファイルすべてで warning はありませんでした(info のみ)`,
      )
    }
  }
  return failedCount > 0 ? 1 : 0
}
