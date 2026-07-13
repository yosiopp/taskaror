// taskaror CLI のディスパッチ(コマンド振り分け・ヘルプ・バージョン表示)。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveCommand } from './commands/serve'
import { validateCommand } from './commands/validate'

/** サブコマンド 1 件の定義 */
export interface Command {
  /** ヘルプに表示する 1 行説明 */
  description: string
  /** コマンド本体。プロセスの終了コードを返す */
  run: (argv: string[]) => number | Promise<number>
}

// サブコマンドのレジストリ(名前 → 定義)。
// 後続のコマンド(lint など)はここに追記する。
const commands: Record<string, Command> = {
  serve: serveCommand,
  validate: validateCommand,
}

/** 自パッケージのディレクトリを返す */
function ownDir(): string {
  // esbuild で CJS にバンドルした実行時は __dirname(= dist/)が使える。
  // Vitest(ESM)からソースを直接実行する場合は import.meta.url(= src/)から求める。
  return typeof __dirname === 'string'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))
}

/** 自パッケージの package.json からバージョンを実行時に読む */
function ownVersion(): string {
  const pkgPath = path.join(ownDir(), '..', 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }
  return pkg.version
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
    ...(commandLines.length > 0 ? ['コマンド:', ...commandLines, ''] : []),
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
    console.log(ownVersion())
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
