/**
 * 右ペインのガントチャート(自前 SVG 描画)。
 * gantt.ts の computeGanttLayout が返す GanttLayout の座標をそのまま描くだけにし、
 * 座標計算は UI 側で再発明しない。
 * 時間軸ヘッダは sticky top。縦横スクロールは App の共有スクロール容器が受け持つ
 * ので、このコンポーネント自体はスクロールコンテナを持たない(左右の行ずれ防止)。
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type {
  DayWindow,
  GanttLayout,
  GanttRowLayout,
} from '@taskaror/core/gantt'
import {
  estimateFromRange,
  pxToDayDelta,
  shiftDateByBusinessDays,
  shiftDateByDays,
} from '@taskaror/core/gantt'
import type { TaskFields } from '@taskaror/core/editor'
import { HEADER_HEIGHT, MONTH_BAND_HEIGHT } from './constants'

/** 選択中の依存線(先行→後続の 1 本)。相互排他のため App で一元管理する */
export interface DependencyRef {
  /** 先行タスク id(depends に載る側) */
  predId: string
  /** 後続タスク id(depends を持つ側) */
  succId: string
}

/** 接続ハンドルの側。end=バー右端(後続を張る)/ start=バー左端(先行を張る) */
type LinkSide = 'start' | 'end'

export interface GanttChartProps {
  layout: GanttLayout
  /**
   * 描画する日カラムのインデックス窓(仮想化)。可視範囲に重なる日カラム・月ラベル
   * だけを描く。null / 未指定なら全日カラムを描く(SSR・初期化直後のフォールバック)。
   * バー・矢印・行罫線・今日線は常に全描画(タスク数で有界)。
   */
  dayWindow?: DayWindow | null
  /** 選択中タスク id(該当バーを強調) */
  selectedId: string | null
  /** 選択中の依存線(該当矢印を強調)。タスク選択とは相互排他 */
  selectedDependency: DependencyRef | null
  /** クリティカルパス上のタスク id 集合(該当バー・矢印を強調) */
  criticalIds: ReadonlySet<string>
  /** クリティカルパスの強調表示が ON か */
  showCritical: boolean
  /** バークリック・キーボードでの行選択に連動 */
  onSelectBar: (id: string) => void
  /** 依存線(矢印)クリックでの選択。App でタスク選択と相互排他に調停する */
  onSelectDependency: (dep: DependencyRef) => void
  /** バードラッグ・キーボードでの start / estimate 変更を反映する */
  onUpdateTask: (id: string, changes: Partial<TaskFields>) => void
  /** 依存線ドラッグ確定: predId(先行)→ succId(後続。succ.depends に pred を足す) */
  onLinkDependency: (predId: string, succId: string) => void
  /** 依存線ドラッグ中の可否判定(ドロップ先ハイライトの色分けに使う) */
  canLinkDependency: (predId: string, succId: string) => boolean
}

/** 依存線ドラッグ中のプレビュー(始点=接続ハンドル、終点=現在のポインタ) */
interface LinkPreview {
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** ドロップ先のタスク id(チャート外なら null) */
  targetId: string | null
  /** この向きで依存を張れるか(canLinkDependency の結果) */
  valid: boolean
}

/**
 * 接続ハンドル(半径 LINK_HANDLE_RADIUS の円)の中心をバー端からどれだけ
 * 外側に出すか(px)。ハンドルは非ホバー時 pointer-events:none のため、バーとの間に
 * 隙間があるとホバーの連鎖が切れて掴めなくなる。半径未満のオフセットにして
 * ハンドルの内側をバー端に重ねる(隙間ゼロ)ことで、バーからそのまま掴める。
 */
const LINK_HANDLE_RADIUS = 4
const LINK_HANDLE_OFFSET = 3

const DAY_BAND_HEIGHT = HEADER_HEIGHT - MONTH_BAND_HEIGHT

/**
 * 接続ハンドルの側(side)から依存の向き(先行 pred → 後続 succ)を決める。
 * - end(バー右端): ドラッグ元が先行・ドラッグ先が後続(後続へ伸ばす順方向)
 * - start(バー左端): ドラッグ先が先行・ドラッグ元が後続(先行から引く逆方向)
 * どちらの向きでも可否判定・確定は同じ (predId, succId) の形に正規化して扱う。
 */
function linkPair(
  fromId: string,
  targetId: string,
  side: LinkSide,
): DependencyRef {
  return side === 'end'
    ? { predId: fromId, succId: targetId }
    : { predId: targetId, succId: fromId }
}

/** バー端(接続ハンドルの付く位置)の X 座標。milestone はひし形の左右頂点 */
function edgeX(row: GanttRowLayout, side: LinkSide): number {
  if (side === 'end') {
    const right =
      row.kind === 'milestone' ? row.cx + row.barHeight / 2 : row.x + row.width
    return right + LINK_HANDLE_OFFSET
  }
  const left = row.kind === 'milestone' ? row.cx - row.barHeight / 2 : row.x
  return left - LINK_HANDLE_OFFSET
}

function GanttChart(props: GanttChartProps) {
  const {
    layout,
    dayWindow,
    selectedId,
    selectedDependency,
    criticalIds,
    showCritical,
    onSelectBar,
    onSelectDependency,
    onUpdateTask,
    onLinkDependency,
    canLinkDependency,
  } = props
  const { width, height, dayWidth } = layout
  // クリティカル判定は表示 ON のときだけ有効にする
  const isCritical = (id: string): boolean =>
    showCritical && criticalIds.has(id)

  // --- 依存線ドラッグ(バー端ハンドル → 対象バー) ---
  // 座標変換のため本文 SVG の参照を持つ。ドラッグ中の始点は ref、描画用は state。
  // linkSideRef はどちら端のハンドルから始めたか(end=後続へ / start=先行から)を保持し、
  // 可否判定・確定時に依存の向き(pred/succ)へ正規化するのに使う。
  const bodyRef = useRef<SVGSVGElement>(null)
  const linkFromRef = useRef<string | null>(null)
  const linkSideRef = useRef<LinkSide>('end')
  const [linking, setLinking] = useState(false)
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null)
  // linkPreview の最新値をイベントハンドラ(render 外)から読むためのミラー。
  // 確定時に親コールバックを setState 更新関数の中で呼ぶと「レンダー中に別コンポーネントを
  // 更新した」警告になるため、ここから読んで更新関数の外で呼ぶ。
  const linkPreviewRef = useRef<LinkPreview | null>(null)
  const setPreview = (next: LinkPreview | null): void => {
    linkPreviewRef.current = next
    setLinkPreview(next)
  }

  // window リスナは linking の間だけ張る(下の effect)。その中で参照する
  // layout / 判定コールバックは毎レンダーで identity が変わるため、ref 経由で
  // 最新値を読み、effect の依存は linking だけにして再購読を避ける。
  // ref の更新はレンダー中ではなく effect で行う(react-hooks/refs 準拠)。
  const layoutRef = useRef(layout)
  const canLinkRef = useRef(canLinkDependency)
  const onLinkRef = useRef(onLinkDependency)
  useEffect(() => {
    layoutRef.current = layout
    canLinkRef.current = canLinkDependency
    onLinkRef.current = onLinkDependency
  })

  const rowById = new Map(layout.rows.map((row) => [row.id, row]))

  // 接続ハンドルを掴んだら依存線ドラッグを開始する。side でどちら端かを覚えておく。
  const startLink = (fromId: string, side: LinkSide): void => {
    const row = rowById.get(fromId)
    if (row === undefined) return
    const x = edgeX(row, side)
    linkFromRef.current = fromId
    linkSideRef.current = side
    setPreview({
      fromX: x,
      fromY: row.cy,
      toX: x,
      toY: row.cy,
      targetId: null,
      valid: false,
    })
    setLinking(true)
    setLinkingBodyClass(true)
  }

  // ドラッグ中だけ window でポインタ移動・離しと Esc を受ける。依存は linking のみ。
  // cleanup で body クラスも必ず落とすので、ドラッグ中にアンマウントしても残らない。
  useEffect(() => {
    if (!linking) return
    const finish = (commit: boolean): void => {
      const fromId = linkFromRef.current
      const side = linkSideRef.current
      // 確定情報は ref から読み、preview を閉じてから(= 更新関数の外で)親を呼ぶ
      const preview = linkPreviewRef.current
      linkFromRef.current = null
      setPreview(null)
      setLinking(false)
      if (
        commit &&
        preview &&
        fromId !== null &&
        preview.targetId !== null &&
        preview.valid
      ) {
        const pair = linkPair(fromId, preview.targetId, side)
        onLinkRef.current(pair.predId, pair.succId)
      }
    }
    const handleMove = (event: globalThis.PointerEvent): void => {
      const svg = bodyRef.current
      const fromId = linkFromRef.current
      const prev = linkPreviewRef.current
      if (svg === null || fromId === null || prev === null) return
      const layout = layoutRef.current
      const rect = svg.getBoundingClientRect()
      const toX = event.clientX - rect.left
      const toY = event.clientY - rect.top
      const inChart =
        toX >= 0 && toX <= layout.width && toY >= 0 && toY <= layout.height
      const target = inChart
        ? layout.rows[Math.floor(toY / layout.rowHeight)]
        : undefined
      const targetId = target && target.id !== fromId ? target.id : null
      // side に応じて (pred, succ) へ正規化してから可否判定する
      const pair =
        targetId !== null
          ? linkPair(fromId, targetId, linkSideRef.current)
          : null
      const valid =
        pair !== null && canLinkRef.current(pair.predId, pair.succId)
      setPreview({ ...prev, toX, toY, targetId, valid })
    }
    const handleUp = (): void => finish(true)
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') finish(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('keydown', handleKey)
      setLinkingBodyClass(false)
    }
  }, [linking])

  if (layout.days.length === 0) {
    return (
      <div className="gantt-col">
        <p className="gantt-empty">表示するタスクがありません</p>
      </div>
    )
  }

  // 仮想化: 可視窓が指定されていればその範囲の日カラム・月ラベルだけを描く。
  // 窓が無ければ全日カラムを描く(バー・矢印・行罫線・今日線は常に全描画)。
  const { first, last } = dayWindow ?? {
    first: 0,
    last: layout.days.length - 1,
  }
  const visibleDays = layout.days.slice(first, last + 1)
  const windowStartX = first * dayWidth
  const windowEndX = (last + 1) * dayWidth
  const visibleMonths = layout.months.filter(
    (month) => month.x < windowEndX && month.x + month.width > windowStartX,
  )

  return (
    <div className="gantt-col">
      <div className="gantt-inner" style={{ width }}>
        <div className="gantt-header" style={{ height: HEADER_HEIGHT }}>
          <svg width={width} height={HEADER_HEIGHT} role="presentation">
            {/* 週末シェード(日ラベル帯) */}
            {visibleDays.map((day) =>
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
            {/* 月ラベル(可視範囲に重なるものだけ) */}
            {visibleMonths.map((month) => (
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
            {visibleDays.map((day) => (
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
          ref={bodyRef}
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
            <marker
              id="gantt-arrowhead-selected"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path className="gantt-arrowhead-selected" d="M0,0 L6,3 L0,6 Z" />
            </marker>
          </defs>

          {/* 週末列のシェード */}
          {visibleDays.map((day) =>
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

          {/* 依存矢印(両端がクリティカルなら強調 / 選択中はアクセント色で太く)。
              当たり判定が細くて掴みにくいので、透明で太いヒットラインを重ねて
              クリックで選択できるようにする(選択はクリティカル強調より優先表示)。 */}
          {layout.arrows.map((arrow) => {
            const critical = isCritical(arrow.fromId) && isCritical(arrow.toId)
            const selected =
              selectedDependency !== null &&
              selectedDependency.predId === arrow.fromId &&
              selectedDependency.succId === arrow.toId
            const points = arrow.points.map((p) => `${p.x},${p.y}`).join(' ')
            const stateClass =
              (critical ? ' critical' : '') + (selected ? ' selected' : '')
            const markerEnd = selected
              ? 'url(#gantt-arrowhead-selected)'
              : critical
                ? 'url(#gantt-arrowhead-critical)'
                : 'url(#gantt-arrowhead)'
            return (
              <g key={`a-${arrow.fromId}-${arrow.toId}`}>
                <polyline
                  className={`gantt-arrow${stateClass}`}
                  points={points}
                  markerEnd={markerEnd}
                />
                <polyline
                  className="gantt-arrow-hit"
                  points={points}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectDependency({
                      predId: arrow.fromId,
                      succId: arrow.toId,
                    })
                  }}
                />
              </g>
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
              onStartLink={startLink}
            />
          ))}

          {/* 依存線ドラッグのプレビュー(最前面) */}
          {linkPreview !== null ? (
            <LinkDragLayer
              preview={linkPreview}
              rowById={rowById}
              layout={layout}
            />
          ) : null}
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
  /**
   * 接続ハンドルの押下で依存線ドラッグを開始する。
   * side=end(右端)はこのバーを先行に、start(左端)はこのバーを後続にする。
   */
  onStartLink: (fromId: string, side: LinkSide) => void
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
  onStartLink,
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
    // Ctrl/Cmd+矢印はグローバルのタスク移動/インデントに委ねる(ここでは扱わない)
    if (event.ctrlKey || event.metaKey) return
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

  // 依存線ドラッグの接続ハンドル。ホバー/フォーカス時だけ触れる(CSS 制御)。
  //  - end(右端): ドラッグ先を後続にする(順方向。塗りつぶし円)
  //  - start(左端): ドラッグ先を先行にする(逆方向。中抜き円で区別)
  const linkHandle = (side: LinkSide) => (
    <circle
      className={`gantt-link-handle ${side}`}
      cx={edgeX(row, side)}
      cy={row.cy}
      r={LINK_HANDLE_RADIUS}
      aria-hidden="true"
      onPointerDown={(event) => {
        event.stopPropagation()
        event.preventDefault()
        onStartLink(row.id, side)
      }}
    >
      <title>
        {side === 'end'
          ? 'ドラッグして後続タスクを設定'
          : 'ドラッグして先行タスクを設定'}
      </title>
    </circle>
  )

  if (row.kind === 'milestone') {
    const half = row.barHeight / 2
    const points = [
      `${cx},${row.cy - half}`,
      `${cx + half},${row.cy}`,
      `${cx},${row.cy + half}`,
      `${cx - half},${row.cy}`,
    ].join(' ')
    return (
      <g className="gantt-bar-group">
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
        {linkHandle('start')}
        {linkHandle('end')}
      </g>
    )
  }

  if (row.kind === 'summary') {
    const summaryHeight = Math.max(6, Math.round(row.barHeight * 0.45))
    const summaryY = row.cy - summaryHeight / 2
    return (
      <g className="gantt-bar-group">
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
        {linkHandle('start')}
        {linkHandle('end')}
      </g>
    )
  }

  // task: 本体(移動)+ 進捗オーバーレイ + 右端ハンドル(リサイズ)+ 接続ハンドル
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
      {linkHandle('start')}
      {linkHandle('end')}
    </g>
  )
}

interface LinkDragLayerProps {
  preview: LinkPreview
  rowById: Map<string, GanttRowLayout>
  layout: GanttLayout
}

/** 依存線ドラッグ中の点線と、ドロップ先行のハイライトを最前面に描く */
function LinkDragLayer({ preview, rowById, layout }: LinkDragLayerProps) {
  const targetRow =
    preview.targetId !== null ? rowById.get(preview.targetId) : undefined
  return (
    <g className="gantt-link-layer" aria-hidden="true">
      {targetRow !== undefined ? (
        <rect
          className={`gantt-link-target${preview.valid ? ' valid' : ' invalid'}`}
          x={0}
          y={targetRow.y}
          width={layout.width}
          height={layout.rowHeight}
        />
      ) : null}
      <line
        className={`gantt-link-line${preview.valid ? ' valid' : ''}`}
        x1={preview.fromX}
        y1={preview.fromY}
        x2={preview.toX}
        y2={preview.toY}
        markerEnd="url(#gantt-arrowhead)"
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

/** 依存線ドラッグ中のカーソル(十字)をページ全体で統一する body クラス */
function setLinkingBodyClass(on: boolean): void {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('is-gantt-linking', on)
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
