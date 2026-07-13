// validate コマンド: spec ファイルを JSON Schema 検証+構造検証にかけ、問題を一覧表示する。
// 検証本体はフェーズ 1 で実装済みの @taskaror/core/validate(validateTaskSpec =
// Ajv2020 + ajv-formats による schema/1.0/taskspec.schema.json 検証 → 構造検証)を再利用する。
import { parseArgs } from 'node:util'
import { validateTaskSpec } from '@taskaror/core/validate'
import type { Command } from '../cli'
import { loadSpecFile } from '../specFile'

/**
 * 1 ファイルを読み込んで検証し、結果を表示する。問題がなければ true を返す。
 * 問題は「パス: メッセージ」の形式で 1 件 1 行で列挙する。
 */
function validateFile(file: string): boolean {
  const loaded = loadSpecFile(file)
  if (!loaded.ok) {
    console.error(`${file}: ${loaded.message}`)
    return false
  }
  const issues = validateTaskSpec(loaded.spec)
  if (issues.length > 0) {
    console.error(`${file}: ${issues.length} 件の問題が見つかりました`)
    for (const issue of issues) {
      console.error(`  ${issue.path}: ${issue.message}`)
    }
    return false
  }
  console.log(`${file}: OK`)
  return true
}

/** validate の使い方(ヘルプ)の文面 */
function validateUsage(): string {
  return [
    '使い方: taskaror validate <ファイル>...',
    '',
    'spec ファイルを JSON Schema+構造検証にかけ、問題を一覧表示する。',
    '複数ファイルを指定できる。問題があれば終了コード 1 を返す。',
    '',
    'オプション:',
    '  -h, --help  この使い方を表示する',
  ].join('\n')
}

/** validate コマンド本体。終了コードを返す */
function runValidate(argv: string[]): number {
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
      `エラー: validate の引数を解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (help === true) {
    console.log(validateUsage())
    return 0
  }
  if (files.length === 0) {
    console.error('エラー: 検証する spec ファイルを 1 つ以上指定してください')
    console.error('使い方: taskaror validate <ファイル>...')
    return 2
  }

  const okCount = files.filter((file) => validateFile(file)).length
  const failedCount = files.length - okCount
  // 複数ファイルを検証したときは最後に集計を出す
  if (files.length > 1) {
    if (failedCount > 0) {
      console.error(
        `${files.length} ファイル中 ${failedCount} ファイルに問題があります`,
      )
    } else {
      console.log(`${files.length} ファイルすべて OK`)
    }
  }
  return failedCount > 0 ? 1 : 0
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const validateCommand: Command = {
  description: 'spec ファイルを検証する(JSON Schema+構造)',
  run: runValidate,
}
