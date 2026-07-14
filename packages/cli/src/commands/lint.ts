// lint コマンド: spec ファイルからスケジュール導出の意味論上の矛盾・怪しい記述を検出する。
// ルールの仕様は site/lint.md、検出本体は @taskaror/core/lint(lintTaskSpec)。
// lint は valid な spec が前提のため、先に validateTaskSpec で検証し、
// エラーがあれば lint せずに validate を促す。
import { lintTaskSpec } from '@taskaror/core/lint'
import type { Command } from '../cli'
import { runFilesCommand } from '../filesCommand'
import type { FileOutcome } from '../filesCommand'
import { loadValidatedSpec } from '../specFile'

/** lint の使い方(ヘルプ)の文面 */
function lintUsage(): string {
  return [
    '使い方: taskaror lint <ファイル>...',
    '',
    'spec のスケジュール導出から見た矛盾・怪しい記述を検出する(ルールは https://yosiopp.github.io/taskaror/lint/)。',
    '複数ファイルを指定できる。warning があれば終了コード 1、info のみなら 0 を返す。',
    '',
    'オプション:',
    '  -h, --help  この使い方を表示する',
  ].join('\n')
}

/**
 * 1 ファイルを読み込んで lint し、指摘を表示する。
 * 指摘は「[重大度] パス (id): ルール ID: メッセージ」の形式で 1 件 1 行、
 * 先頭にサマリ行を出す。指摘がなければ OK 1 行(site/lint.md「CLI の挙動」)。
 */
function lintFile(file: string): FileOutcome {
  // 構造が壊れた spec(循環など)に lint すると誤動作するため、先に validate 相当を通す
  const spec = loadValidatedSpec(
    file,
    (count) =>
      `${file}: ${count} 件の検証エラーがあるため lint できません(先に taskaror validate を通してください)`,
  )
  if (spec === null) return { ok: false, clean: false }

  const issues = lintTaskSpec(spec)
  if (issues.length === 0) {
    console.log(`${file}: OK`)
    return { ok: true, clean: true }
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
  return { ok: warningCount === 0, clean: false }
}

/** lint コマンド本体。終了コードを返す */
function runLint(argv: string[]): number {
  return runFilesCommand(
    {
      name: 'lint',
      usage: lintUsage(),
      noFilesMessage:
        'エラー: lint する spec ファイルを 1 つ以上指定してください',
      failNoun: '指摘',
      processFile: lintFile,
    },
    argv,
  )
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const lintCommand: Command = {
  description:
    'spec の矛盾・怪しい記述を検出する(ルールは https://yosiopp.github.io/taskaror/lint/)',
  run: runLint,
}
