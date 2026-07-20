// taskaror CLI のディスパッチ(コマンド振り分け・ヘルプ・バージョン表示)。
// バージョンは package.json からビルド時(esbuild のバンドル)に焼き込まれる
import packageJson from '../package.json'
import { pdfCommand, pngCommand } from './commands/export'
import { lintCommand } from './commands/lint'
import { serveCommand } from './commands/serve'
import { svgCommand } from './commands/svg'
import { validateCommand } from './commands/validate'

/** サブコマンド 1 件の定義 */
export interface Command {
  /** ヘルプに表示する 1 行説明 */
  description: string
  /** コマンド本体。プロセスの終了コードを返す */
  run: (argv: string[]) => number | Promise<number>
}

// サブコマンドのレジストリ(名前 → 定義)。後続のコマンドはここに追記する。
const commands: Record<string, Command> = {
  serve: serveCommand,
  validate: validateCommand,
  lint: lintCommand,
  svg: svgCommand,
  png: pngCommand,
  pdf: pdfCommand,
}

/** 使い方(ヘルプ)の文面を組み立てる */
export function usage(): string {
  const names = Object.keys(commands)
  const width = Math.max(10, ...names.map((name) => name.length))
  const commandLines = names.map(
    (name) => `  ${name.padEnd(width)}  ${commands[name].description}`,
  )
  return [
    '使い方: taskaror <コマンド> [オプション]',
    '',
    'コマンド:',
    ...commandLines,
    '',
    'オプション:',
    '  -h, --help     この使い方を表示する',
    '  -v, --version  バージョンを表示する',
  ].join('\n')
}

/**
 * CLI 本体。引数(process.argv.slice(2) 相当)を解釈して終了コードを返す。
 * 先頭の引数をサブコマンド名としてレジストリから引き、残りをコマンドへ渡す。
 */
export async function runCli(argv: string[]): Promise<number> {
  const [first, ...rest] = argv

  if (first === undefined || first === '--help' || first === '-h') {
    console.log(usage())
    return 0
  }
  if (first === '--version' || first === '-v') {
    console.log(packageJson.version)
    return 0
  }
  if (first.startsWith('-')) {
    console.error(`エラー: 不明なオプションです: ${first}`)
    console.error('')
    console.error(usage())
    return 2
  }

  const command: Command | undefined = Object.hasOwn(commands, first)
    ? commands[first]
    : undefined
  if (command === undefined) {
    console.error(`エラー: 不明なコマンドです: ${first}`)
    console.error('')
    console.error(usage())
    return 2
  }
  return await command.run(rest)
}
