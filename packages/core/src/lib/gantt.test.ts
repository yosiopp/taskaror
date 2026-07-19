import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import {
  computeDayWindow,
  computeGanttLayout,
  estimateFromRange,
  filterCompleted,
  flattenScheduled,
  nextSelectionAfterRemoval,
  pxToDayDelta,
  shiftDateByBusinessDays,
  shiftDateByDays,
  type GanttRow,
} from './gantt'
import { scheduleTasks, type ScheduledTask } from './schedule'

// 基準となる曜日(2026-07):
//  13(月) 14(火) 15(水) 16(木) 17(金) 18(土) 19(日) 20(月) 21(火) 22(水)
const TODAY = '2026-07-13'

function spec(tasks: TaskSpec['tasks']): TaskSpec {
  return { taskspec: '1.0', tasks }
}

function rowId(row: GanttRow): string {
  return row.scheduled.task.id
}

/** テスト用に ScheduledTask を直接組み立てる(scheduleTasks を介さないケース用) */
function scheduled(overrides: Partial<ScheduledTask>): ScheduledTask {
  return {
    task: { id: 'x', title: 'X' },
    start: TODAY,
    end: TODAY,
    durationDays: 1,
    isMilestone: false,
    isSummary: false,
    children: [],
    ...overrides,
  }
}

describe('flattenScheduled', () => {
  it('ネストを深さ優先(親→子)で平坦化し depth / hasChildren を付与する', () => {
    const roots = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          tasks: [
            { id: 'c1', title: 'C1', estimate: '1d' },
            { id: 'c2', title: 'C2', estimate: '1d', depends: ['c1'] },
          ],
        },
        { id: 'q', title: 'Q', estimate: '1d' },
      ]),
      { today: TODAY },
    )
    const rows = flattenScheduled(roots)

    expect(rows.map(rowId)).toEqual(['p', 'c1', 'c2', 'q'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0])
    expect(rows.map((r) => r.hasChildren)).toEqual([true, false, false, false])
    expect(rows.every((r) => r.collapsed === false)).toBe(true)
  })

  it('collapsedIds に含まれる親は子孫を省き自身は collapsed=true で残す', () => {
    const roots = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          tasks: [{ id: 'c1', title: 'C1', estimate: '1d' }],
        },
        { id: 'q', title: 'Q', estimate: '1d' },
      ]),
      { today: TODAY },
    )
    const rows = flattenScheduled(roots, new Set(['p']))

    expect(rows.map(rowId)).toEqual(['p', 'q'])
    expect(rows[0].collapsed).toBe(true)
    expect(rows[0].hasChildren).toBe(true)
  })

  it('子を持たない id を collapsedIds に入れても collapsed にはならない', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', estimate: '1d' }]),
      { today: TODAY },
    )
    const rows = flattenScheduled(roots, new Set(['a']))
    expect(rows[0].collapsed).toBe(false)
  })
})

describe('filterCompleted', () => {
  it('progress === 100 のタスクとその子孫を落とす', () => {
    const roots = scheduleTasks(
      spec([
        { id: 'a', title: 'A', estimate: '1d', progress: 100 },
        { id: 'b', title: 'B', estimate: '1d', progress: 50 },
        {
          id: 'p',
          title: 'P',
          progress: 100,
          tasks: [{ id: 'c', title: 'C', estimate: '1d' }],
        },
      ]),
      { today: TODAY },
    )
    const kept = filterCompleted(roots)
    expect(kept.map((n) => n.task.id)).toEqual(['b'])
  })

  it('完了した子だけを親から取り除く', () => {
    const roots = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          tasks: [
            { id: 'c1', title: 'C1', estimate: '1d', progress: 100 },
            { id: 'c2', title: 'C2', estimate: '1d' },
          ],
        },
      ]),
      { today: TODAY },
    )
    const kept = filterCompleted(roots)
    expect(kept.map((n) => n.task.id)).toEqual(['p'])
    expect(kept[0].children.map((n) => n.task.id)).toEqual(['c2'])
  })
})

describe('nextSelectionAfterRemoval', () => {
  const rows = (): GanttRow[] =>
    flattenScheduled(
      scheduleTasks(
        spec([
          {
            id: 'p',
            title: 'P',
            tasks: [
              { id: 'c1', title: 'C1', estimate: '1d' },
              { id: 'c2', title: 'C2', estimate: '1d' },
            ],
          },
          { id: 'q', title: 'Q', estimate: '1d' },
        ]),
        { today: TODAY },
      ),
    )
  // 表示順: p, c1, c2, q

  it('中間の行を消すと直下の可視タスクを選ぶ', () => {
    expect(nextSelectionAfterRemoval(rows(), 'c1')).toBe('c2')
  })

  it('末尾の行を消すと直上の行を選ぶ', () => {
    expect(nextSelectionAfterRemoval(rows(), 'q')).toBe('c2')
  })

  it('子を持つ親を消すと、部分木(子孫)を飛ばした直後を選ぶ', () => {
    expect(nextSelectionAfterRemoval(rows(), 'p')).toBe('q')
  })

  it('唯一の行を消すと null', () => {
    const only = flattenScheduled(
      scheduleTasks(spec([{ id: 'a', title: 'A', estimate: '1d' }]), {
        today: TODAY,
      }),
    )
    expect(nextSelectionAfterRemoval(only, 'a')).toBeNull()
  })

  it('存在しない id は null', () => {
    expect(nextSelectionAfterRemoval(rows(), 'zzz')).toBeNull()
  })
})

describe('computeGanttLayout: 期間と軸', () => {
  it('rangeStart / rangeEnd に paddingDays の余白を足し days を全暦日列挙する', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 1,
    })

    // start=end=07-13 の前後 1 日 → 07-12 〜 07-14
    expect(layout.rangeStart).toBe('2026-07-12')
    expect(layout.rangeEnd).toBe('2026-07-14')
    expect(layout.days.map((d) => d.date)).toEqual([
      '2026-07-12',
      '2026-07-13',
      '2026-07-14',
    ])
    expect(layout.days.map((d) => d.x)).toEqual([0, 10, 20])
    // 07-12 は日曜
    expect(layout.days.map((d) => d.isWeekend)).toEqual([true, false, false])
    expect(layout.width).toBe(30)
    expect(layout.height).toBe(20)
  })

  it('months は YYYY-MM でグルーピングし幅を日数 * dayWidth にする', () => {
    // 07-31(金)開始 1d を置くと余白込みで 07-30 〜 08-01 が範囲になり月をまたぐ
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-31', estimate: '1d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 1,
    })
    // 範囲: 07-30, 07-31, 08-01
    expect(layout.months).toEqual([
      { label: '2026-07', x: 0, width: 20 },
      { label: '2026-08', x: 20, width: 10 },
    ])
  })

  it('期間が上限(MAX_GANTT_DAYS)を超えると例外を投げる(巨大 days 配列によるフリーズ防止)', () => {
    const rows = flattenScheduled([
      scheduled({ task: { id: 'a', title: 'A' } }),
      scheduled({
        task: { id: 'b', title: 'B' },
        start: '9999-12-31',
        end: '9999-12-31',
      }),
    ])
    expect(() => computeGanttLayout(rows, { today: TODAY })).toThrow(
      /期間が長すぎる/,
    )
  })

  it('期間が上限以内なら例外を投げない', () => {
    const rows = flattenScheduled([
      scheduled({ task: { id: 'a', title: 'A' } }),
      scheduled({
        task: { id: 'b', title: 'B' },
        start: '2036-07-13',
        end: '2036-07-13',
      }),
    ])
    // 2026-07-13 〜 2036-07-13 は約 3,653 日で上限(5,000 日)以内
    expect(() => computeGanttLayout(rows, { today: TODAY })).not.toThrow()
  })
})

describe('computeGanttLayout: バー / マイルストーン', () => {
  it('タスクバーの X と幅は開始・終了日を含む(dayIndex 変換)', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-13', estimate: '3d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 1,
    })
    // rangeStart=07-12。07-13 は dayIndex=1、07-15 は dayIndex=3
    const bar = layout.rows[0]
    expect(bar.kind).toBe('task')
    expect(bar.x).toBe(10)
    // 07-13〜07-15 の 3 暦日ぶん
    expect(bar.width).toBe(30)
    expect(bar.y).toBe(0)
    expect(bar.cy).toBe(10)
  })

  it('行に title / start / end を保持する(アクセシビリティ・ドラッグ用)', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: '設計', start: '2026-07-13', estimate: '3d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const bar = layout.rows[0]
    expect(bar.title).toBe('設計')
    expect(bar.start).toBe('2026-07-13')
    // 月から 3 営業日 -> 水曜 07-15
    expect(bar.end).toBe('2026-07-15')
  })

  it('barHeight 既定は rowHeight*0.5、barY は上下中央寄せ', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const bar = layout.rows[0]
    expect(bar.barHeight).toBe(10)
    expect(bar.barY).toBe(5) // (20 - 10) / 2
  })

  it('マイルストーンは width=0 で cx が開始カラム中央', () => {
    const roots = scheduleTasks(
      spec([{ id: 'm', title: 'M', start: '2026-07-13' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 1,
    })
    const ms = layout.rows[0]
    expect(ms.kind).toBe('milestone')
    expect(ms.width).toBe(0)
    // rangeStart=07-12 → 07-13 は dayIndex=1 → cx = (1 + 0.5) * 10 = 15
    expect(ms.cx).toBe(15)
    expect(ms.progressWidth).toBe(0)
  })

  it('サマリー(親)は kind=summary で progressWidth=0', () => {
    const roots = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          progress: 50,
          tasks: [{ id: 'c', title: 'C', estimate: '1d' }],
        },
      ]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const summary = layout.rows.find((r) => r.id === 'p')!
    expect(summary.kind).toBe('summary')
    expect(summary.progressWidth).toBe(0)
  })
})

describe('computeGanttLayout: 進捗オーバーレイ', () => {
  it('task の progressWidth = width * progress/100', () => {
    const rows = flattenScheduled([
      scheduled({
        task: { id: 'a', title: 'A', progress: 40 },
        start: '2026-07-13',
        end: '2026-07-13',
      }),
    ])
    const layout = computeGanttLayout(rows, {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 0,
    })
    const bar = layout.rows[0]
    expect(bar.width).toBe(10)
    expect(bar.progressWidth).toBeCloseTo(4)
  })

  it('progress は 0〜100 にクランプする', () => {
    const rows = flattenScheduled([
      scheduled({
        task: { id: 'a', title: 'A', progress: 150 },
        start: '2026-07-13',
        end: '2026-07-13',
      }),
    ])
    const layout = computeGanttLayout(rows, {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 0,
    })
    expect(layout.rows[0].progressWidth).toBe(10)
  })
})

describe('computeGanttLayout: 今日線', () => {
  it('range 内なら todayX を暦日 X で返す', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: '2026-07-13',
      paddingDays: 1,
    })
    // rangeStart=07-12 → 07-13 は dayIndex=1 → X=10
    expect(layout.todayX).toBe(10)
  })

  it('range 外なら null', () => {
    const roots = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' }]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: '2026-08-01',
      paddingDays: 1,
    })
    expect(layout.todayX).toBeNull()
  })
})

describe('computeGanttLayout: 依存矢印', () => {
  it('可視行どうしの依存にだけ finish-to-start の折れ線を作る', () => {
    const roots = scheduleTasks(
      spec([
        { id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' },
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
      ]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
      paddingDays: 1,
    })

    expect(layout.arrows).toHaveLength(1)
    const arrow = layout.arrows[0]
    expect(arrow.fromId).toBe('a')
    expect(arrow.toId).toBe('b')
    const a = layout.rows.find((r) => r.id === 'a')!
    const b = layout.rows.find((r) => r.id === 'b')!
    // 始点は先行バー右端、終点は後続バー左端
    expect(arrow.points[0]).toEqual({ x: a.x + a.width, y: a.cy })
    expect(arrow.points[arrow.points.length - 1]).toEqual({ x: b.x, y: b.cy })
  })

  it('先行が折りたたみで非表示なら矢印を作らない', () => {
    const roots = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          tasks: [{ id: 'a', title: 'A', estimate: '1d' }],
        },
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
      ]),
      { today: TODAY },
    )
    // p を畳むと子 a は非表示 → a への依存は矢印にしない
    const rows = flattenScheduled(roots, new Set(['p']))
    const layout = computeGanttLayout(rows, {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    expect(layout.arrows).toHaveLength(0)
  })

  it('先行がマイルストーンなら端点に cx を使う', () => {
    const roots = scheduleTasks(
      spec([
        { id: 'm', title: 'M', start: '2026-07-13' },
        { id: 'n', title: 'N', estimate: '1d', depends: ['m'] },
      ]),
      { today: TODAY },
    )
    const layout = computeGanttLayout(flattenScheduled(roots), {
      dayWidth: 10,
      rowHeight: 20,
      today: TODAY,
    })
    const m = layout.rows.find((r) => r.id === 'm')!
    const arrow = layout.arrows[0]
    expect(arrow.points[0].x).toBe(m.cx)
  })
})

describe('computeGanttLayout: 空入力', () => {
  it('visibleRows が空ならすべて空 / 0 の妥当な GanttLayout を返す', () => {
    const layout = computeGanttLayout([], { dayWidth: 10, rowHeight: 20 })
    expect(layout).toMatchObject({
      width: 0,
      height: 0,
      dayWidth: 10,
      rowHeight: 20,
      rangeStart: '',
      rangeEnd: '',
      days: [],
      months: [],
      rows: [],
      arrows: [],
      todayX: null,
    })
  })
})

describe('computeDayWindow', () => {
  it('可視 X 範囲を日インデックス窓に変換し overscan を前後に足す', () => {
    // daysCount=100, dayWidth=10。X 200〜350 → 20〜35、overscan 2 → 18〜37
    expect(computeDayWindow(100, 10, 200, 350, 2)).toEqual({
      first: 18,
      last: 37,
    })
  })

  it('overscan 0 では floor 変換のみ', () => {
    expect(computeDayWindow(100, 10, 205, 344, 0)).toEqual({
      first: 20,
      last: 34,
    })
  })

  it('0 未満・総日数超えは [0, daysCount-1] にクランプする', () => {
    // first: floor(-5)-3=-8 → 0、last: floor(5)+3=8
    expect(computeDayWindow(100, 10, -50, 50, 3)).toEqual({ first: 0, last: 8 })
    // 範囲がすべて右外 → 末尾のみ
    expect(computeDayWindow(100, 10, 5000, 6000, 0)).toEqual({
      first: 99,
      last: 99,
    })
  })

  it('daysCount 0 / dayWidth 0 は空窓 { first: 0, last: -1 } を返す', () => {
    expect(computeDayWindow(0, 10, 0, 100)).toEqual({ first: 0, last: -1 })
    expect(computeDayWindow(100, 0, 0, 100)).toEqual({ first: 0, last: -1 })
  })
})

describe('pxToDayDelta', () => {
  it('px 移動量を dayWidth で割って四捨五入する', () => {
    expect(pxToDayDelta(0, 28)).toBe(0)
    expect(pxToDayDelta(28, 28)).toBe(1)
    expect(pxToDayDelta(41, 28)).toBe(1) // 1.46 -> 1
    expect(pxToDayDelta(42, 28)).toBe(2) // 1.5 -> 2
    expect(pxToDayDelta(-28, 28)).toBe(-1)
    expect(pxToDayDelta(-56, 28)).toBe(-2)
  })
})

describe('shiftDateByDays', () => {
  it('暦日で前後にずらす(土日も 1 日として数える)', () => {
    // 金 +1 暦日 -> 土
    expect(shiftDateByDays('2026-07-17', 1)).toBe('2026-07-18')
    expect(shiftDateByDays('2026-07-13', -1)).toBe('2026-07-12')
    expect(shiftDateByDays('2026-07-13', 0)).toBe('2026-07-13')
  })
})

describe('shiftDateByBusinessDays', () => {
  it('営業日で前後にずらす(土日を飛ばす)', () => {
    // 金 +1 営業日 -> 翌月曜
    expect(shiftDateByBusinessDays('2026-07-17', 1)).toBe('2026-07-20')
    // 月 -1 営業日 -> 前週金曜
    expect(shiftDateByBusinessDays('2026-07-13', -1)).toBe('2026-07-10')
  })
})

describe('estimateFromRange', () => {
  it('開始〜終了の営業日数(両端含む)を日単位 estimate にする', () => {
    // 月〜金 = 5 営業日
    expect(estimateFromRange('2026-07-13', '2026-07-17')).toBe('5d')
    // 単日 = 1d
    expect(estimateFromRange('2026-07-13', '2026-07-13')).toBe('1d')
    // 終了が土日に落ちても営業日だけ数える(月〜土 = 月火水木金 の 5 営業日)
    expect(estimateFromRange('2026-07-13', '2026-07-18')).toBe('5d')
  })

  it('終了が開始より前でも最小 1 営業日にクランプする', () => {
    expect(estimateFromRange('2026-07-13', '2026-07-10')).toBe('1d')
  })
})
