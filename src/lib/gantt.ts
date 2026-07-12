/**
 * ガントチャート描画のためのレイアウト計算。
 * React・DOM・ブラウザ API に依存しない純粋関数として実装し、
 * 将来の CLI(SVG 出力)からも再利用できるようにする。
 *
 * 入力は schedule.ts の ScheduledTask ツリー。ここでは SVG 描画に必要な
 * 幾何情報(座標・寸法)だけを計算し、導出値は保存しない(Single Source of Truth)。
 *
 * 座標系は暦日(土日を含む)を 1 カラムとし、X は日カラムの左端を表す。
 */
import {
  addDays,
  formatDate,
  isWeekend,
  maxDate,
  minDate,
  parseDate,
  today,
} from './date'
import type { ScheduledTask } from './schedule'

const MS_PER_DAY = 86_400_000

/** 表示行モデル。左グリッドと右ガントで共有し、行を揃えるための平坦化単位 */
export interface GanttRow {
  scheduled: ScheduledTask
  /** ルート = 0 */
  depth: number
  /** scheduled.children.length > 0 */
  hasChildren: boolean
  /** hasChildren かつ collapsedIds に含まれる */
  collapsed: boolean
}

/**
 * ScheduledTask ツリーを表示順(深さ優先・親→子)に平坦化する。
 * collapsedIds に含まれる id のタスクは、その子孫を出力しない(自身は出力する)。
 */
export function flattenScheduled(
  roots: ScheduledTask[],
  collapsedIds: ReadonlySet<string> = new Set(),
  depth = 0,
): GanttRow[] {
  const rows: GanttRow[] = []
  for (const scheduled of roots) {
    const hasChildren = scheduled.children.length > 0
    const collapsed = hasChildren && collapsedIds.has(scheduled.task.id)
    rows.push({ scheduled, depth, hasChildren, collapsed })
    if (hasChildren && !collapsed) {
      rows.push(
        ...flattenScheduled(scheduled.children, collapsedIds, depth + 1),
      )
    }
  }
  return rows
}

export interface GanttLayoutOptions {
  /** 1 暦日あたりの px 幅 */
  dayWidth: number
  /** 1 行あたりの px 高 */
  rowHeight: number
  /** タスクバー高(既定: rowHeight の約 0.5、上下中央寄せ) */
  barHeight?: number
  /** 今日線の基準日(省略時は date.ts の today()) */
  today?: Date | string
  /** 期間の前後に足す余白日数(既定 1) */
  paddingDays?: number
}

export type GanttBarKind = 'task' | 'summary' | 'milestone'

export interface GanttRowLayout {
  /** task.id */
  id: string
  /** visibleRows での 0 始まり index */
  rowIndex: number
  /** 行の上端 = rowIndex * rowHeight */
  y: number
  kind: GanttBarKind
  /** バー左端 X(milestone では未使用でも設定) */
  x: number
  /** バー幅(milestone は 0) */
  width: number
  /** バー上端 Y */
  barY: number
  barHeight: number
  /** 進捗オーバーレイ幅(task のみ。summary/milestone は 0) */
  progressWidth: number
  /** milestone ひし形の中心 X(= 開始日カラム中央) */
  cx: number
  /** 行の縦中央 Y */
  cy: number
}

export interface GanttArrow {
  fromId: string
  toId: string
  /** 先行バー右端 → 後続バー左端を結ぶ折れ線の頂点列 */
  points: { x: number; y: number }[]
}

export interface GanttAxisDay {
  /** 'YYYY-MM-DD' */
  date: string
  /** この日カラムの左端 X */
  x: number
  isWeekend: boolean
}

export interface GanttAxisMonth {
  /** 例 '2026-07' */
  label: string
  /** 月の左端 X */
  x: number
  /** 月の幅(その月の日数 * dayWidth) */
  width: number
}

export interface GanttLayout {
  /** SVG 全体幅(= days.length * dayWidth) */
  width: number
  /** SVG 全体高(= visibleRows.length * rowHeight) */
  height: number
  dayWidth: number
  rowHeight: number
  /** 先頭日 'YYYY-MM-DD' */
  rangeStart: string
  /** 末尾日 'YYYY-MM-DD' */
  rangeEnd: string
  days: GanttAxisDay[]
  months: GanttAxisMonth[]
  rows: GanttRowLayout[]
  arrows: GanttArrow[]
  /** 今日線 X(範囲外なら null) */
  todayX: number | null
}

/**
 * visibleRows(= flattenScheduled の結果)に対して幾何を計算する。
 * 期間は visibleRows 全体の start 最小〜end 最大に paddingDays を足して決める。
 * visibleRows が空なら、すべて空 / 0 の妥当な GanttLayout を返す。
 */
export function computeGanttLayout(
  visibleRows: GanttRow[],
  options: GanttLayoutOptions,
): GanttLayout {
  const { dayWidth, rowHeight } = options
  const paddingDays = options.paddingDays ?? 1
  const barHeight = options.barHeight ?? Math.round(rowHeight * 0.5)

  if (visibleRows.length === 0) {
    return {
      width: 0,
      height: 0,
      dayWidth,
      rowHeight,
      rangeStart: '',
      rangeEnd: '',
      days: [],
      months: [],
      rows: [],
      arrows: [],
      todayX: null,
    }
  }

  // 期間 = 全行の start 最小 〜 end 最大に前後の余白を足したもの
  let minStart = parseDate(visibleRows[0].scheduled.start)
  let maxEnd = parseDate(visibleRows[0].scheduled.end)
  for (const { scheduled } of visibleRows) {
    minStart = minDate(minStart, parseDate(scheduled.start))
    maxEnd = maxDate(maxEnd, parseDate(scheduled.end))
  }
  const rangeStartDate = addDays(minStart, -paddingDays)
  const rangeEndDate = addDays(maxEnd, paddingDays)

  // 暦日インデックス(0 始まり)。X = dayIndex * dayWidth
  const dayIndexOf = (date: string): number =>
    calendarDaysBetween(rangeStartDate, parseDate(date))

  // days: rangeStart 〜 rangeEnd を 1 暦日刻みで全列挙(週末を含む)
  const days: GanttAxisDay[] = []
  for (
    let cursor = rangeStartDate;
    cursor.getTime() <= rangeEndDate.getTime();
    cursor = addDays(cursor, 1)
  ) {
    days.push({
      date: formatDate(cursor),
      x: calendarDaysBetween(rangeStartDate, cursor) * dayWidth,
      isWeekend: isWeekend(cursor),
    })
  }

  // months: days を 'YYYY-MM' でグルーピングする
  const months: GanttAxisMonth[] = []
  for (const day of days) {
    const label = day.date.slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.label === label) {
      last.width += dayWidth
    } else {
      months.push({ label, x: day.x, width: dayWidth })
    }
  }

  // rows: 各表示行のバー / マイルストーン幾何
  const rows: GanttRowLayout[] = visibleRows.map(({ scheduled }, rowIndex) => {
    const y = rowIndex * rowHeight
    const cy = y + rowHeight / 2
    const barY = y + (rowHeight - barHeight) / 2
    const startIndex = dayIndexOf(scheduled.start)
    const endIndex = dayIndexOf(scheduled.end)
    const cx = (startIndex + 0.5) * dayWidth
    const kind = kindOf(scheduled)

    if (kind === 'milestone') {
      return {
        id: scheduled.task.id,
        rowIndex,
        y,
        kind,
        x: startIndex * dayWidth,
        width: 0,
        barY,
        barHeight,
        progressWidth: 0,
        cx,
        cy,
      }
    }

    // 開始日・終了日を含む幅
    const x = startIndex * dayWidth
    const width = (endIndex - startIndex + 1) * dayWidth
    const progressWidth =
      kind === 'task'
        ? width * (clamp(scheduled.task.progress ?? 0, 0, 100) / 100)
        : 0
    return {
      id: scheduled.task.id,
      rowIndex,
      y,
      kind,
      x,
      width,
      barY,
      barHeight,
      progressWidth,
      cx,
      cy,
    }
  })

  // arrows: 依存を finish-to-start の折れ線で結ぶ。
  //  先行 id が可視行に存在するときのみ生成する(非表示行への矢印は作らない)
  const layoutById = new Map<string, GanttRowLayout>()
  for (const row of rows) layoutById.set(row.id, row)

  const arrows: GanttArrow[] = []
  const gap = dayWidth / 2
  for (const { scheduled } of visibleRows) {
    const depends = scheduled.task.depends
    if (!depends) continue
    const to = layoutById.get(scheduled.task.id)
    if (to === undefined) continue
    for (const fromId of depends) {
      const from = layoutById.get(fromId)
      if (from === undefined) continue
      arrows.push(buildArrow(from, to, gap))
    }
  }

  // 今日線: range 外なら null
  const todayDate = resolveToday(options.today)
  const inRange =
    todayDate.getTime() >= rangeStartDate.getTime() &&
    todayDate.getTime() <= rangeEndDate.getTime()
  const todayX = inRange
    ? calendarDaysBetween(rangeStartDate, todayDate) * dayWidth
    : null

  return {
    width: days.length * dayWidth,
    height: visibleRows.length * rowHeight,
    dayWidth,
    rowHeight,
    rangeStart: formatDate(rangeStartDate),
    rangeEnd: formatDate(rangeEndDate),
    days,
    months,
    rows,
    arrows,
    todayX,
  }
}

/** 先行バー右端 → 後続バー左端を結ぶ直角折れ線を作る */
function buildArrow(
  from: GanttRowLayout,
  to: GanttRowLayout,
  gap: number,
): GanttArrow {
  // マイルストーンは端点として中心(cx)を使う
  const fromX = from.kind === 'milestone' ? from.cx : from.x + from.width
  const toX = to.kind === 'milestone' ? to.cx : to.x
  const points = [
    { x: fromX, y: from.cy },
    { x: fromX + gap, y: from.cy },
    { x: fromX + gap, y: to.cy },
    { x: toX, y: to.cy },
  ]
  return { fromId: from.id, toId: to.id, points }
}

function kindOf(scheduled: ScheduledTask): GanttBarKind {
  if (scheduled.isMilestone) return 'milestone'
  if (scheduled.isSummary) return 'summary'
  return 'task'
}

/** from から to までの暦日数(両端の 0 時起点の差) */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resolveToday(value: GanttLayoutOptions['today']): Date {
  if (value === undefined) return today()
  return typeof value === 'string' ? parseDate(value) : value
}
