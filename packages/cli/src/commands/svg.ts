// svg コマンド: spec ファイルからガントチャートを自己完結した SVG として出力する。
// フェーズ 4 で実装済みのレイアウト計算を再利用し、web の SVG エクスポート
// (App.tsx の buildGanttSvg)と同じ流れ
// (scheduleTasks → flattenScheduled → computeGanttLayout → renderGanttSvg)を踏襲する。
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { computeGanttLayout, flattenScheduled } from '@taskaror/core/gantt'
import { renderGanttSvg } from '@taskaror/core/ganttSvg'
import { scheduleTasks } from '@taskaror/core/schedule'
import { validateTaskSpec } from '@taskaror/core/validate'
import type { Command } from '../cli'
import { loadSpecFile } from '../specFile'

// web(packages/web/src/components/constants.ts)と同じレイアウト定数。
// GUI のガント表示・SVG エクスポートと同じ見た目になるよう値を揃えている。
/** 1 暦日あたりの px 幅 */
const DAY_WIDTH = 28
/** 1 行あたりの px 高 */
const ROW_HEIGHT = 34
/** 時間軸ヘッダの px 高 */
const HEADER_HEIGHT = 48
/** ヘッダのうち月ラベル帯の px 高 */
const MONTH_BAND_HEIGHT = 20

/** svg の使い方(ヘルプ)の文面 */
function svgUsage(): string {
  return [
    '使い方: taskaror svg <ファイル> [-o <出力先>]',
    '',
    'spec からガントチャートを自己完結した SVG として出力する。',
    '-o を省略すると標準出力へ書き出す。',
    '',
    'オプション:',
    '  -o, --output <出力先>  SVG の書き出し先ファイル',
    '  -h, --help             この使い方を表示する',
  ].join('\n')
}

/** svg コマンド本体。終了コードを返す */
function runSvg(argv: string[]): number {
  let output: string | undefined
  let files: string[]
  let help: boolean | undefined
  try {
    const parsed = parseArgs({
      args: argv,
      options: {
        output: { type: 'string', short: 'o' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    })
    output = parsed.values.output
    files = parsed.positionals
    help = parsed.values.help
  } catch (err) {
    console.error(
      `エラー: svg のオプションを解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (help === true) {
    console.log(svgUsage())
    return 0
  }
  if (files.length !== 1) {
    console.error('エラー: spec ファイルを 1 つ指定してください')
    console.error('使い方: taskaror svg <ファイル> [-o <出力先>]')
    return 2
  }
  const file = files[0]

  // 読み込み(validate と共通のヘルパー)+ 検証。問題のある spec は描画しない
  const loaded = loadSpecFile(file)
  if (!loaded.ok) {
    console.error(`${file}: ${loaded.message}`)
    return 1
  }
  const issues = validateTaskSpec(loaded.spec)
  if (issues.length > 0) {
    console.error(
      `${file}: ${issues.length} 件の問題があるため SVG を出力できません`,
    )
    for (const issue of issues) {
      console.error(`  ${issue.path}: ${issue.message}`)
    }
    return 1
  }

  // スケジュール導出 → 全行の平坦化 → レイアウト計算 → SVG 描画(web と同じ流れ)。
  // 「今日」(今日線・開始日の既定)は実行時のローカル日付を使う
  let svg: string
  try {
    const rows = flattenScheduled(scheduleTasks(loaded.spec))
    const layout = computeGanttLayout(rows, {
      dayWidth: DAY_WIDTH,
      rowHeight: ROW_HEIGHT,
    })
    svg = renderGanttSvg(
      layout,
      rows.map((row) => ({ id: row.scheduled.task.id, depth: row.depth })),
      { headerHeight: HEADER_HEIGHT, monthBandHeight: MONTH_BAND_HEIGHT },
    )
  } catch (err) {
    console.error(
      `${file}: SVG を生成できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 1
  }

  // -o 省略時は標準出力へ、指定時はファイルへ書き出す
  if (output === undefined) {
    console.log(svg)
    return 0
  }
  try {
    writeFileSync(output, svg)
  } catch (err) {
    console.error(
      `エラー: 出力先に書き込めません: ${output}(${err instanceof Error ? err.message : String(err)})`,
    )
    return 1
  }
  console.log(`SVG を書き出しました: ${output}`)
  return 0
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const svgCommand: Command = {
  description: 'spec からガントチャート SVG を出力する',
  run: runSvg,
}
