// svg コマンド: spec ファイルからガントチャートを自己完結した SVG として出力する。
// フェーズ 4 で実装済みのレイアウト計算を再利用し、web の SVG エクスポート
// (App.tsx の buildGanttSvg)と同じ流れ
// (scheduleTasks → flattenScheduled → computeGanttLayout → renderGanttSvg)を踏襲する。
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { computeGanttLayout, flattenScheduled } from '@taskaror/core/gantt'
import { renderGanttSvg } from '@taskaror/core/ganttSvg'
import { scheduleTasks } from '@taskaror/core/schedule'
import type { Command } from '../cli'
import { loadValidatedSpec } from '../specFile'

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

  // 読み込み+検証(validate / lint と共通のヘルパー)。問題のある spec は描画しない
  const spec = loadValidatedSpec(
    file,
    (count) => `${file}: ${count} 件の問題があるため SVG を出力できません`,
  )
  if (spec === null) return 1

  // スケジュール導出 → 全行の平坦化 → レイアウト計算 → SVG 描画(web と同じ流れ)。
  // レイアウト定数は core の既定値(web のガント表示と同じ値)をそのまま使う。
  // 「今日」(今日線・開始日の既定)は実行時のローカル日付を使う
  let svg: string
  try {
    const rows = flattenScheduled(scheduleTasks(spec))
    const layout = computeGanttLayout(rows)
    svg = renderGanttSvg(
      layout,
      rows.map((row) => ({ id: row.scheduled.task.id, depth: row.depth })),
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
