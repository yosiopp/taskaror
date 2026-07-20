// png / pdf コマンド: spec からガントチャートを PNG 画像 / PDF として出力する。
// SVG の組み立てまでは svg コマンドと共通(ganttExport.ts)。ラスタライズ / PDF 化は
// ランタイム依存ゼロ方針を守るため、npm パッケージではなくシステムにインストール
// 済みの Chrome / Chromium / Edge のヘッドレス実行(chrome.ts)で行う。
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import type { Command } from '../cli'
import { findChrome, runChrome } from '../chrome'
import type { ChromeRunner } from '../chrome'
import { buildGanttSvg, svgSize, wrapSvgHtml } from '../ganttExport'
import type { SvgSize } from '../ganttExport'
import { loadValidatedSpec } from '../specFile'

/** PNG の描画倍率(--scale)の既定値。web の PNG エクスポートの上限と揃える */
const DEFAULT_SCALE = 2
/** --scale に指定できる範囲 */
const MIN_SCALE = 1
const MAX_SCALE = 4

/** 出力フォーマット(png / pdf)ごとの差分 */
interface ExportFormat {
  /** コマンド名 = 出力ファイルの拡張子 */
  name: 'png' | 'pdf'
  /** ヘルプ・メッセージで使う表記 */
  label: string
  /** --scale オプションを受け付けるか(PNG のみ) */
  hasScale: boolean
  /** ブラウザに渡す出力指示の引数を組み立てる */
  chromeArgs: (outPath: string, size: SvgSize, scale: number) => string[]
}

const PNG_FORMAT: ExportFormat = {
  name: 'png',
  label: 'PNG',
  hasScale: true,
  chromeArgs: (outPath, size, scale) => [
    `--window-size=${Math.ceil(size.width)},${Math.ceil(size.height)}`,
    `--force-device-scale-factor=${scale}`,
    '--default-background-color=FFFFFFFF',
    `--screenshot=${outPath}`,
  ],
}

const PDF_FORMAT: ExportFormat = {
  name: 'pdf',
  label: 'PDF',
  hasScale: false,
  chromeArgs: (outPath) => [
    '--no-pdf-header-footer',
    `--print-to-pdf=${outPath}`,
  ],
}

/** テストでブラウザの探索・起動を差し替えるための依存 */
export interface ExportDeps {
  findChrome: typeof findChrome
  runChrome: ChromeRunner
}

/** ヘッドレス起動の共通引数。プロファイルを一時ディレクトリに隔離する */
function commonChromeArgs(profileDir: string): string[] {
  return [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    `--user-data-dir=${profileDir}`,
  ]
}

/** -o 省略時の出力先。入力ファイルの拡張子を出力フォーマットに置き換える */
export function defaultOutputPath(file: string, ext: string): string {
  const match = file.match(/^(.+?)(\.taskspec)?\.ya?ml$/i)
  const base = match === null ? file : match[1]
  return `${base}.${ext}`
}

/** 使い方(ヘルプ)の文面 */
function exportUsage(format: ExportFormat): string {
  return [
    `使い方: taskaror ${format.name} <ファイル> [-o <出力先>]` +
      (format.hasScale ? ' [--scale <倍率>]' : ''),
    '',
    `spec からガントチャートを ${format.label} として出力する。`,
    '変換にはインストール済みの Chrome / Chromium / Edge をヘッドレス起動して使う',
    '(自動検出できない場合は環境変数 TASKAROR_CHROME にパスを指定する)。',
    `-o を省略すると入力ファイルの拡張子を .${format.name} に変えたパスへ書き出す。`,
    '',
    'オプション:',
    `  -o, --output <出力先>  ${format.label} の書き出し先ファイル`,
    ...(format.hasScale
      ? [
          `  --scale <倍率>         描画倍率(${MIN_SCALE}〜${MAX_SCALE} の数値。既定は ${DEFAULT_SCALE})`,
        ]
      : []),
    '  -h, --help             この使い方を表示する',
  ].join('\n')
}

/** コマンド本体。終了コードを返す */
async function runExport(
  format: ExportFormat,
  deps: ExportDeps,
  argv: string[],
): Promise<number> {
  let output: string | undefined
  let scaleRaw: string | undefined
  let files: string[]
  let help: boolean | undefined
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        output: { type: 'string', short: 'o' },
        help: { type: 'boolean', short: 'h' },
        ...(format.hasScale ? { scale: { type: 'string' } } : {}),
      },
      allowPositionals: true,
    })
    output = parsed.values.output
    scaleRaw = (parsed.values as { scale?: string }).scale
    files = parsed.positionals
    help = parsed.values.help
  } catch (err) {
    console.error(
      `エラー: ${format.name} のオプションを解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (help === true) {
    console.log(exportUsage(format))
    return 0
  }
  if (files.length !== 1) {
    console.error('エラー: spec ファイルを 1 つ指定してください')
    console.error(
      `使い方: taskaror ${format.name} <ファイル> [-o <出力先>]` +
        (format.hasScale ? ' [--scale <倍率>]' : ''),
    )
    return 2
  }
  const file = files[0]

  let scale = DEFAULT_SCALE
  if (scaleRaw !== undefined) {
    scale = Number(scaleRaw)
    if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
      console.error(
        `エラー: --scale は ${MIN_SCALE}〜${MAX_SCALE} の数値で指定してください`,
      )
      return 2
    }
  }

  // 読み込み+検証(svg コマンドと同じ)。問題のある spec は描画しない
  const spec = loadValidatedSpec(
    file,
    (count) =>
      `${file}: ${count} 件の問題があるため ${format.label} を出力できません`,
  )
  if (spec === null) return 1

  let svg: string
  try {
    svg = buildGanttSvg(spec)
  } catch (err) {
    console.error(
      `${file}: ${format.label} を生成できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 1
  }
  const size = svgSize(svg)
  if (size === null) {
    console.error('エラー: 生成した SVG から寸法を取得できません')
    return 1
  }

  const lookup = deps.findChrome()
  if (!lookup.ok) {
    console.error(`エラー: ${lookup.message}`)
    return 1
  }

  const outPath = output ?? defaultOutputPath(file, format.name)

  // SVG を包んだ HTML・使い捨てプロファイル・ブラウザの出力先を一時ディレクトリに
  // まとめ、終了後に消す。出力はまず一時ディレクトリに書かせて、成功したときだけ
  // outPath へコピーする(失敗時に既存の出力ファイルを壊さないため)
  const workDir = mkdtempSync(path.join(tmpdir(), `taskaror-${format.name}-`))
  try {
    const htmlPath = path.join(workDir, 'gantt.html')
    writeFileSync(htmlPath, wrapSvgHtml(svg, size))
    const tmpOut = path.join(workDir, `gantt.${format.name}`)
    const args = [
      ...commonChromeArgs(path.join(workDir, 'profile')),
      ...format.chromeArgs(tmpOut, size, scale),
      pathToFileURL(htmlPath).href,
    ]
    const result = await deps.runChrome(lookup.path, args, tmpOut)
    if (!result.ok) {
      console.error(
        `エラー: ${format.label} への変換に失敗しました(${lookup.path}): ${result.message}`,
      )
      return 1
    }
    if (!existsSync(tmpOut)) {
      console.error(
        `エラー: ${format.label} が書き出されませんでした(ブラウザの実行環境を確認してください)`,
      )
      return 1
    }
    try {
      copyFileSync(tmpOut, outPath)
    } catch (err) {
      console.error(
        `エラー: 出力先に書き込めません: ${outPath}(${err instanceof Error ? err.message : String(err)})`,
      )
      return 1
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
  console.log(`${format.label} を書き出しました: ${outPath}`)
  return 0
}

/** テスト用: 依存を差し替えた png コマンドを作る */
export function createPngCommand(deps: ExportDeps): Command {
  return {
    description: 'spec からガントチャート PNG を出力する(要 Chrome/Edge)',
    run: (argv) => runExport(PNG_FORMAT, deps, argv),
  }
}

/** テスト用: 依存を差し替えた pdf コマンドを作る */
export function createPdfCommand(deps: ExportDeps): Command {
  return {
    description: 'spec からガントチャート PDF を出力する(要 Chrome/Edge)',
    run: (argv) => runExport(PDF_FORMAT, deps, argv),
  }
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
const defaultDeps: ExportDeps = { findChrome, runChrome }
export const pngCommand: Command = createPngCommand(defaultDeps)
export const pdfCommand: Command = createPdfCommand(defaultDeps)
