// ガントチャートのエクスポート共通処理。svg / png / pdf コマンドで共用する。
// SVG の組み立ては web の SVG エクスポート(App.tsx の buildGanttSvg)と同じ流れ
// (scheduleTasks → flattenScheduled → computeGanttLayout → renderGanttSvg)を踏襲する。
import { computeGanttLayout, flattenScheduled } from '@taskaror/core/gantt'
import { renderGanttSvg } from '@taskaror/core/ganttSvg'
import { scheduleTasks } from '@taskaror/core/schedule'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

/** spec からガントチャートの自己完結した SVG 文字列を組み立てる */
export function buildGanttSvg(spec: TaskSpec): string {
  const rows = flattenScheduled(scheduleTasks(spec))
  const layout = computeGanttLayout(rows)
  return renderGanttSvg(
    layout,
    rows.map((row) => ({ id: row.scheduled.task.id, depth: row.depth })),
  )
}

/** SVG の寸法(px) */
export interface SvgSize {
  width: number
  height: number
}

/** renderGanttSvg が出力した SVG のルート要素から寸法(px)を取り出す */
export function svgSize(svg: string): SvgSize | null {
  const match = svg.match(
    /<svg [^>]*?\bwidth="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/,
  )
  if (match === null) return null
  return { width: Number(match[1]), height: Number(match[2]) }
}

/**
 * SVG をブラウザのヘッドレス描画で変換するための最小 HTML に包む。
 * @page はチャート全体をぴったり 1 ページに収めるための指定で PDF 出力
 * (--print-to-pdf)にのみ効く。スクリーンショット(PNG 出力)には影響しない。
 */
export function wrapSvgHtml(svg: string, size: SvgSize): string {
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><style>',
    'html, body { margin: 0; padding: 0; }',
    'svg { display: block; }',
    `@page { size: ${size.width}px ${size.height}px; margin: 0; }`,
    '</style></head><body>',
    svg,
    '</body></html>',
  ].join('\n')
}
