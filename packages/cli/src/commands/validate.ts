// validate コマンド: spec ファイルを JSON Schema 検証+構造検証にかけ、問題を一覧表示する。
// 検証本体はフェーズ 1 で実装済みの @taskaror/core/validate(validateTaskSpec =
// Ajv2020 + ajv-formats による schema/1.0/taskspec.schema.json 検証 → 構造検証)を再利用する。
import type { Command } from '../cli'
import { runFilesCommand } from '../filesCommand'
import { loadValidatedSpec } from '../specFile'

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

/**
 * 1 ファイルを読み込んで検証し、結果を表示する。問題がなければ true を返す。
 * 問題は「パス: メッセージ」の形式で 1 件 1 行で列挙する(loadValidatedSpec が表示する)。
 */
function validateFile(file: string): boolean {
  const spec = loadValidatedSpec(
    file,
    (count) => `${file}: ${count} 件の問題が見つかりました`,
  )
  if (spec === null) return false
  console.log(`${file}: OK`)
  return true
}

/** validate コマンド本体。終了コードを返す */
function runValidate(argv: string[]): number {
  return runFilesCommand(
    {
      name: 'validate',
      usage: validateUsage(),
      noFilesMessage:
        'エラー: 検証する spec ファイルを 1 つ以上指定してください',
      failNoun: '問題',
      // validate は「問題なし = 成功」なので ok と clean は常に一致する
      processFile: (file) => {
        const ok = validateFile(file)
        return { ok, clean: ok }
      },
    },
    argv,
  )
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const validateCommand: Command = {
  description: 'spec ファイルを検証する(JSON Schema+構造)',
  run: runValidate,
}
