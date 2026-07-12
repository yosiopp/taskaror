import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import {
  computeGanttLayout,
  flattenScheduled,
  type GanttLayout,
  type GanttRow,
} from './gantt'
import { renderGanttSvg } from './ganttSvg'
import { scheduleTasks } from './schedule'

// gantt.test.ts と同じ基準日(2026-07-13 は月曜)
const TODAY = '2026-07-13'

function spec(tasks: TaskSpec['tasks']): TaskSpec {
  return { taskspec: '1.0', tasks }
}

/** 依存・親子・マイルストーンを含むレイアウトと行を作る */
function buildSample(): { layout: GanttLayout; rows: GanttRow[] } {
  const roots = scheduleTasks(
    spec([
      {
        id: 'p',
        title: '設計',
        tasks: [
          { id: 'a', title: 'API設計', start: '2026-07-13', estimate: '3d' },
          {
            id: 'b',
            title: '実装',
            estimate: '2d',
            depends: ['a'],
            progress: 40,
          },
        ],
      },
      { id: 'm', title: 'リリース', depends: ['b'] },
    ]),
    { today: TODAY },
  )
  const rows = flattenScheduled(roots)
  const layout = computeGanttLayout(rows, {
    dayWidth: 10,
    rowHeight: 20,
    today: TODAY,
    paddingDays: 1,
  })
  return { layout, rows }
}

function labelsOf(rows: GanttRow[]): { id: string; depth: number }[] {
  return rows.map((row) => ({ id: row.scheduled.task.id, depth: row.depth }))
}

/** 文字列中の pattern の出現回数 */
function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

describe('renderGanttSvg: 全体構造', () => {
  it('xmlns 付きの完全な <svg> 文字列を返す', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('寸法はラベル列 + ガント幅、ヘッダ + ガント高になる(既定 220/48)', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    // 既定 labelWidth=220, headerHeight=48
    expect(svg).toContain(`width="${220 + layout.width}"`)
    expect(svg).toContain(`height="${48 + layout.height}"`)
  })

  it('options で寸法(labelWidth / headerHeight)を差し替えできる', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows), {
      labelWidth: 100,
      headerHeight: 40,
      monthBandHeight: 16,
    })
    expect(svg).toContain(`width="${100 + layout.width}"`)
    expect(svg).toContain(`height="${40 + layout.height}"`)
  })
})

describe('renderGanttSvg: 内容', () => {
  it('行数(タスク数)ぶんのバーを含む', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(countMatches(svg, /data-gantt-bar=/g)).toBe(layout.rows.length)
  })

  it('タスク名ラベルを含む(親・子・マイルストーンとも)', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(svg).toContain('設計')
    expect(svg).toContain('API設計')
    expect(svg).toContain('実装')
    expect(svg).toContain('リリース')
  })

  it('マイルストーンはひし形(polygon)で描く', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(svg).toContain('<polygon')
  })

  it('進捗のあるタスクは進捗オーバーレイ(2 枚目の rect)を描く', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows), {
      colors: { progress: '#123456' },
    })
    expect(svg).toContain('fill="#123456"')
  })

  it('今日が範囲内なら今日線(破線)を描く', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(layout.todayX).not.toBeNull()
    expect(svg).toContain('stroke-dasharray="3 2"')
  })

  it('依存があれば矢印(矢じり marker 参照)を描く', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(layout.arrows.length).toBeGreaterThan(0)
    expect(svg).toContain('marker-end="url(#gantt-export-arrow)"')
  })

  it('週末シェードを描く(範囲に日曜 2026-07-12 を含む)', () => {
    const { layout, rows } = buildSample()
    const svg = renderGanttSvg(layout, labelsOf(rows), {
      colors: { weekend: '#eeeeee' },
    })
    expect(svg).toContain('fill="#eeeeee"')
  })

  it('階層の深さでラベルをインデントする(depth 2 → x=36)', () => {
    const roots = scheduleTasks(
      spec([{ id: 't', title: 'X', start: '2026-07-13', estimate: '1d' }]),
      { today: TODAY },
    )
    const rows = flattenScheduled(roots)
    const layout = computeGanttLayout(rows, {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const svg = renderGanttSvg(layout, [{ id: 't', depth: 2 }])
    // indent = 8 + depth*14 = 36
    expect(svg).toContain('x="36"')
  })
})

describe('renderGanttSvg: エスケープ', () => {
  it('タスク名の特殊文字を XML エスケープする', () => {
    const roots = scheduleTasks(
      spec([
        { id: 't', title: 'A & B <tag>', start: '2026-07-13', estimate: '1d' },
      ]),
      { today: TODAY },
    )
    const rows = flattenScheduled(roots)
    const layout = computeGanttLayout(rows, {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const svg = renderGanttSvg(layout, labelsOf(rows))
    expect(svg).toContain('A &amp; B &lt;tag&gt;')
    expect(svg).not.toContain('<tag>')
  })
})

describe('renderGanttSvg: 空入力', () => {
  it('空レイアウトでも妥当な <svg> を返す', () => {
    const layout = computeGanttLayout([], { dayWidth: 10, rowHeight: 20 })
    const svg = renderGanttSvg(layout, [])
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(countMatches(svg, /data-gantt-bar=/g)).toBe(0)
  })
})
