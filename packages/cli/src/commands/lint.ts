// lint コマンド: spec ファイルからスケジュール導出の意味論上の矛盾・怪しい記述を検出する。
// ルールの仕様は docs/lint.md、検出本体は @taskaror/core/lint(lintTaskSpec)。
// lint は valid な spec が前提のため、先に validateTaskSpec で検証し、
// エラーがあれば lint せずに validate を促す。
import { parseArgs } from 'node:util'
import { lintTaskSpec } from '@taskaror/core/lint'
import { validateTaskSpec } from '@taskaror/core/validate'
import type { Command } from '../cli'
import { loadSpecFile } from '../specFile'

/** 1 ファイルの lint 結果。ok は「エラーなし・warning なし」(info は許容) */
interface FileResult {
  ok: boolean
}

/**
 * 1 ファイルを読み込んで lint し、指摘を表示する。
 * 指摘は「[重大度] パス (id): ルール ID: メッセージ」の形式で 1 件 1 行、
 * 先頭にサマリ行を出す。指摘がなければ OK 1 行(docs/lint.md「CLI の挙動」)。
 */
function lintFile(file: string): FileResult {
  const loaded = loadSpecFile(file)
  if (!loaded.ok) {
    console.error(`${file}: ${loaded.message}`)
    return { ok: false }
  }

  // 構造が壊れた spec(循環など)に lint すると誤動作するため、先に validate 相当を通す
  const validationIssues = validateTaskSpec(loaded.spec)
  if (validationIssues.length > 0) {
    console.error(
      `${file}: ${validationIssues.length} 件の検証エラーがあるため lint できません(先に taskaror validate を通してください)`,
    )
    for (const issue of validationIssues) {
      console.error(`  ${issue.path}: ${issue.message}`)
    }
    return { ok: false }
  }

  const issues = lintTaskSpec(loaded.spec)
  if (issues.length === 0) {
    console.log(`${file}: OK`)
    return { ok: true }
  }

  const warningCount = issues.filter(
    (issue) => issue.severity === 'warning',
  ).length
  const infoCount = issues.length - warningCount
  console.log(
    `${file}: ${issues.length} 件の指摘があります(warning ${warningCount} 件・info ${infoCount} 件)`,
  )
  for (const issue of issues) {
    console.log(
      `  [${issue.severity}] ${issue.path} (${issue.taskId}): ${issue.rule}: ${issue.message}`,
    )
  }
  // info のみなら成功扱い(exit 0)。warning があれば失敗扱い(exit 1)
  return { ok: warningCount === 0 }
}

/** lint コマンド本体。終了コードを返す */
function runLint(argv: string[]): number {
  let files: string[]
  try {
    files = parseArgs({
      args: argv,
      options: {},
      allowPositionals: true,
    }).positionals
  } catch (err) {
    console.error(
      `エラー: lint の引数を解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (files.length === 0) {
    console.error('エラー: lint する spec ファイルを 1 つ以上指定してください')
    console.error('使い方: taskaror lint <ファイル>...')
    return 2
  }

  const okCount = files.filter((file) => lintFile(file).ok).length
  const failedCount = files.length - okCount
  // 複数ファイルを lint したときは最後に集計を出す
  if (files.length > 1) {
    if (failedCount > 0) {
      console.error(
        `${files.length} ファイル中 ${failedCount} ファイルに指摘があります`,
      )
    } else {
      console.log(`${files.length} ファイルすべて OK`)
    }
  }
  return failedCount > 0 ? 1 : 0
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const lintCommand: Command = {
  description: 'spec の矛盾・怪しい記述を検出する(ルールは docs/lint.md)',
  run: runLint,
}
