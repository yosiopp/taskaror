/**
 * 右ペインのガントチャート(自前 SVG 描画)。
 * gantt.ts の computeGanttLayout が返す GanttLayout の座標をそのまま描くだけにし、
 * 座標計算は UI 側で再発明しない。
 * 時間軸ヘッダは sticky top。縦横スクロールは App の共有スクロール容器が受け持つ
 * ので、このコンポーネント自体はスクロールコンテナを持たない(左右の行ずれ防止)。
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { GanttLayout, GanttRowLayout } from '../lib/gantt'
import {
  estimateFromRange,
  pxToDayDelta,
  shiftDateByBusinessDays,
  shiftDateByDays,
} from '../lib/gantt'
import type { TaskFields } from '../lib/editor'
import { HEADER_HEIGHT, MONTH_BAND_HEIGHT } from './constants'

export interface GanttChartProps {
  layout: GanttLayout
  /** 選択中タスク id(該当バーを強調) */
  selectedId: string | null
  /** クリティカルパス上のタスク id 集合(該当バー・矢印を強調) */
  criticalIds: ReadonlySet<string>
  /** クリティカルパスの強調表示が ON か */
  showCritical: boolean
  /** バークリック・キーボードでの行選択に連動 */
  onSelectBar: (id: string) => void
  /** バードラッグ・キーボードでの start / estimate 変更を反映する */
  onUpdateTask: (id: string, changes: Partial<TaskFields>) => void
}

const DAY_BAND_HEIGHT = HEADER_HEIGHT - MONTH_BAND_HEIGHT

function GanttChart(props: GanttChartProps) {
  const {
    layout,
    selectedId,
    criticalIds,
    showCritical,
    onSelectBar,
    onUpdateTask,
  } = props
  const { width, height, dayWidth } = layout
  // クリティカル判定は表示 ON のときだけ有効にする
  const isCritical = (id: string): boolean =>
    showCritical && criticalIds.has(id)

  if (layout.days.length === 0) {
    return (
      <div className="gantt-col">
        <p className="gantt-empty">表示するタスクがありません</p>
      </div>
    )
  }

  return (
    <div className="gantt-col">
      <div className="gantt-inner" style={{ width }}>
        <div className="gantt-header" style={{ height: HEADER_HEIGHT }}>
          <svg width={width} height={HEADER_HEIGHT} role="presentation">
            {/* 週末シェード(日ラベル帯) */}
            {layout.days.map((day) =>
              day.isWeekend ? (
                <rect
                  key={`wh-${day.date}`}
                  className="gantt-weekend"
                  x={day.x}
                  y={MONTH_BAND_HEIGHT}
                  width={dayWidth}
                  height={DAY_BAND_HEIGHT}
                />
              ) : null,
            )}
            {/* 月ラベル */}
            {layout.months.map((month) => (
              <g key={`m-${month.label}`}>
                <line
                  className="gantt-header-line"
                  x1={month.x}
                  y1={0}
                  x2={month.x}
                  y2={HEADER_HEIGHT}
                />
                <text
                  className="gantt-month-label"
                  x={month.x + 6}
                  y={MONTH_BAND_HEIGHT - 6}
                >
                  {month.label}
                </text>
              </g>
            ))}
            {/* 日ラベル */}
            {layout.days.map((day) => (
              <text
                key={`d-${day.date}`}
                className={
                  day.isWeekend ? 'gantt-day-label weekend' : 'gantt-day-label'
                }
                x={day.x + dayWidth / 2}
                y={MONTH_BAND_HEIGHT + DAY_BAND_HEIGHT / 2 + 4}
                textAnchor="middle"
              >
                {Number(day.date.slice(8, 10))}
              </text>
            ))}
            <line
              className="gantt-header-line"
              x1={0}
              y1={MONTH_BAND_HEIGHT}
              x2={width}
              y2={MONTH_BAND_HEIGHT}
            />
          </svg>
        </div>

        <svg
          className="gantt-body"
          width={width}
          height={height}
          role="presentation"
        >
          <defs>
            <marker
              id="gantt-arrowhead"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path className="gantt-arrowhead" d="M0,0 L6,3 L0,6 Z" />
            </marker>
            <marker
              id="gantt-arrowhead-critical"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path className="gantt-arrowhead-critical" d="M0,0 L6,3 L0,6 Z" />
            </marker>
          </defs>

          {/* 週末列のシェード */}
          {layout.days.map((day) =>
            day.isWeekend ? (
              <rect
                key={`w-${day.date}`}
                className="gantt-weekend"
                x={day.x}
                y={0}
                width={dayWidth}
                height={height}
              />
            ) : null,
          )}

          {/* 行の横罫線 */}
          {layout.rows.map((row) => (
            <line
              key={`rl-${row.id}`}
              className="gantt-rowline"
              x1={0}
              y1={row.y + layout.rowHeight}
              x2={width}
              y2={row.y + layout.rowHeight}
            />
          ))}

          {/* 今日線 */}
          {layout.todayX !== null ? (
            <line
              className="gantt-today"
              x1={layout.todayX}
              y1={0}
              x2={layout.todayX}
              y2={height}
            />
          ) : null}

          {/* 依存矢印(両端がクリティカルなら強調) */}
          {layout.arrows.map((arrow) => {
            const critical = isCritical(arrow.fromId) && isCritical(arrow.toId)
            return (
              <polyline
                key={`a-${arrow.fromId}-${arrow.toId}`}
                className={critical ? 'gantt-arrow critical' : 'gantt-arrow'}
                points={arrow.points.map((p) => `${p.x},${p.y}`).join(' ')}
                markerEnd={
                  critical
                    ? 'url(#gantt-arrowhead-critical)'
                    : 'url(#gantt-arrowhead)'
                }
              />
            )
          })}

          {/* バー / サマリー / マイルストーン */}
          {layout.rows.map((row) => (
            <Bar
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              critical={isCritical(row.id)}
              dayWidth={dayWidth}
              onSelect={onSelectBar}
              onUpdateTask={onUpdateTask}
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

interface BarProps {
  row: GanttRowLayout
  selected: boolean
  /** クリティカルパス上のバーか(強調クラスを付ける) */
  critical: boolean
  /** 1 暦日あたりの px 幅(px 移動量 → 日数スナップに使う) */
  dayWidth: number
  onSelect: (id: string) => void
  onUpdateTask: (id: string, changes: Partial<TaskFields>) => void
}

/** ドラッグの種別。move = バー本体(start 変更)、resize = 右端(estimate 変更) */
type DragMode = 'move' | 'resize'

/** クリック(選択)とドラッグを区別する閾値(px) */
const DRAG_THRESHOLD = 4
/** バー右端のリサイズハンドルの当たり幅(px) */
const RESIZE_HANDLE = 8

/**
 * 1 行ぶんのバー(kind に応じて task / summary / milestone を描き分ける)。
 * task / milestone はポインタドラッグとキーボードで start / estimate を編集でき、
 * すべての kind はフォーカス可能で Enter/Space による選択・↑↓ でのフォーカス移動に対応する。
 */
function Bar({
  row,
  selected,
  critical,
  dayWidth,
  onSelect,
  onUpdateTask,
}: BarProps) {
  // ドラッグ中のプレビュー(確定は pointerup)。null なら非ドラッグ
  const [drag, setDrag] = useState<{
    mode: DragMode
    deltaDays: number
  } | null>(null)
  // pointermove/up で参照する進行中ドラッグの情報。再レンダーを挟まず読める ref に持つ
  const active = useRef<{
    mode: DragMode
    startX: number
    moved: boolean
  } | null>(null)
  const draggable = row.kind !== 'summary'

  // ドラッグ中のみ Esc でキャンセルできるようにする
  useEffect(() => {
    if (drag === null) return
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        active.current = null
        setDrag(null)
        setDragBodyClass(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [drag])

  const beginDrag = (mode: DragMode, event: PointerEvent<SVGElement>): void => {
    if (!draggable) return
    if (mode === 'resize' && row.kind !== 'task') return // リサイズは task のみ
    event.stopPropagation()
    onSelect(row.id) // 押下時点で選択(クリック選択を維持)
    active.current = { mode, startX: event.clientX, moved: false }
    setDrag({ mode, deltaDays: 0 })
    setDragBodyClass(mode)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<SVGElement>): void => {
    const current = active.current
    if (current === null) return
    const rawDelta = event.clientX - current.startX
    if (Math.abs(rawDelta) >= DRAG_THRESHOLD) current.moved = true
    setDrag({ mode: current.mode, deltaDays: pxToDayDelta(rawDelta, dayWidth) })
  }

  const endDrag = (event: PointerEvent<SVGElement>): void => {
    const current = active.current
    if (current === null) return
    active.current = null
    releaseCapture(event)
    setDrag(null)
    setDragBodyClass(null)
    const deltaDays = pxToDayDelta(event.clientX - current.startX, dayWidth)
    // 閾値未満(=クリック)や実質移動なしは選択のみで確定しない
    if (!current.moved || deltaDays === 0) return
    if (current.mode === 'move') {
      onUpdateTask(row.id, { start: shiftDateByDays(row.start, deltaDays) })
    } else {
      const newEnd = shiftDateByDays(row.end, deltaDays)
      onUpdateTask(row.id, { estimate: estimateFromRange(row.start, newEnd) })
    }
  }

  const cancelDrag = (event: PointerEvent<SVGElement>): void => {
    if (active.current === null) return
    active.current = null
    releaseCapture(event)
    setDrag(null)
    setDragBodyClass(null)
  }

  const handleKeyDown = (event: KeyboardEvent<SVGElement>): void => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelect(row.id)
        break
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault()
        focusSibling(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'ArrowLeft':
      case 'ArrowRight':
        if (row.kind === 'summary') break // サマリーは start 変更の対象外
        event.preventDefault()
        onSelect(row.id)
        onUpdateTask(row.id, {
          start: shiftDateByBusinessDays(
            row.start,
            event.key === 'ArrowRight' ? 1 : -1,
          ),
        })
        break
    }
  }

  // ドラッグ中のプレビュー座標(未ドラッグ時は素の値)
  const shift = (drag?.deltaDays ?? 0) * dayWidth
  const isMove = drag?.mode === 'move'
  const isResize = drag?.mode === 'resize'
  const x = isMove ? row.x + shift : row.x
  const cx = isMove ? row.cx + shift : row.cx
  const barWidth = isResize ? Math.max(dayWidth, row.width + shift) : row.width
  const progressWidth = Math.min(row.progressWidth, barWidth)
  // 選択とクリティカルは両立する(.critical は CSS で .selected の後に定義して強調を優先)
  const stateClass =
    (selected ? ' selected' : '') + (critical ? ' critical' : '')
  const ariaLabel = barAriaLabel(row)

  const pointerHandlers = draggable
    ? {
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: cancelDrag,
      }
    : {}

  if (row.kind === 'milestone') {
    const half = row.barHeight / 2
    const points = [
      `${cx},${row.cy - half}`,
      `${cx + half},${row.cy}`,
      `${cx},${row.cy + half}`,
      `${cx - half},${row.cy}`,
    ].join(' ')
    return (
      <polygon
        className={`gantt-milestone${stateClass}`}
        points={points}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        data-gantt-bar={row.id}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => beginDrag('move', event)}
        {...pointerHandlers}
      />
    )
  }

  if (row.kind === 'summary') {
    const summaryHeight = Math.max(6, Math.round(row.barHeight * 0.45))
    const summaryY = row.cy - summaryHeight / 2
    return (
      <rect
        className={`gantt-summary${stateClass}`}
        x={row.x}
        y={summaryY}
        width={row.width}
        height={summaryHeight}
        rx={2}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        data-gantt-bar={row.id}
        onClick={() => onSelect(row.id)}
        onKeyDown={handleKeyDown}
      />
    )
  }

  // task: 本体(移動)+ 進捗オーバーレイ + 右端ハンドル(リサイズ)
  return (
    <g className="gantt-bar-group">
      <rect
        className={`gantt-bar${stateClass}`}
        x={x}
        y={row.barY}
        width={barWidth}
        height={row.barHeight}
        rx={4}
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        data-gantt-bar={row.id}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => beginDrag('move', event)}
        {...pointerHandlers}
      />
      {progressWidth > 0 ? (
        <rect
          className="gantt-progress"
          x={x}
          y={row.barY}
          width={progressWidth}
          height={row.barHeight}
          rx={4}
        />
      ) : null}
      <rect
        className="gantt-bar-handle"
        x={x + barWidth - Math.min(RESIZE_HANDLE, barWidth)}
        y={row.barY}
        width={Math.min(RESIZE_HANDLE, barWidth)}
        height={row.barHeight}
        aria-hidden="true"
        onPointerDown={(event) => beginDrag('resize', event)}
        {...pointerHandlers}
      />
    </g>
  )
}

/** バーのアクセシブルな説明ラベルを作る(例: 「設計 2026-07-01〜2026-07-03」) */
function barAriaLabel(row: GanttRowLayout): string {
  const title = row.title || '(無題)'
  if (row.kind === 'milestone') return `${title} マイルストーン ${row.start}`
  return `${title} ${row.start}〜${row.end}`
}

/** ドラッグ中のカーソルをページ全体で統一するための body クラスを切り替える */
function setDragBodyClass(mode: DragMode | null): void {
  if (typeof document === 'undefined') return
  const { classList } = document.body
  classList.toggle('is-gantt-moving', mode === 'move')
  classList.toggle('is-gantt-resizing', mode === 'resize')
}

/** 進行中ドラッグのポインタキャプチャを解放する(すでに解放済みでも例外にしない) */
function releaseCapture(event: PointerEvent<SVGElement>): void {
  try {
    event.currentTarget.releasePointerCapture(event.pointerId)
  } catch {
    // 解放済み・別要素キャプチャ時の例外は無視する
  }
}

/**
 * DOM 順で前後のバー(data-gantt-bar を持つ要素)へフォーカスを移す。
 * dir = 1 で次、-1 で前。端では移動しない。
 */
function focusSibling(current: SVGElement, dir: 1 | -1): void {
  const svg = current.closest('svg.gantt-body')
  if (svg === null) return
  const bars = Array.from(svg.querySelectorAll<SVGElement>('[data-gantt-bar]'))
  const index = bars.indexOf(current)
  const next = bars[index + dir]
  if (next) next.focus()
}

export default GanttChart
