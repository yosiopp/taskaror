/**
 * 右ペインのガントチャート(自前 SVG 描画)。
 * gantt.ts の computeGanttLayout が返す GanttLayout の座標をそのまま描くだけにし、
 * 座標計算は UI 側で再発明しない。
 * 時間軸ヘッダは sticky top。縦横スクロールは App の共有スクロール容器が受け持つ
 * ので、このコンポーネント自体はスクロールコンテナを持たない(左右の行ずれ防止)。
 */
import type { GanttLayout, GanttRowLayout } from '../lib/gantt'
import { HEADER_HEIGHT, MONTH_BAND_HEIGHT } from './constants'

export interface GanttChartProps {
  layout: GanttLayout
  /** 選択中タスク id(該当バーを強調) */
  selectedId: string | null
  /** バークリックで行選択に連動 */
  onSelectBar: (id: string) => void
}

const DAY_BAND_HEIGHT = HEADER_HEIGHT - MONTH_BAND_HEIGHT

function GanttChart(props: GanttChartProps) {
  const { layout, selectedId, onSelectBar } = props
  const { width, height, dayWidth } = layout

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

          {/* 依存矢印 */}
          {layout.arrows.map((arrow) => (
            <polyline
              key={`a-${arrow.fromId}-${arrow.toId}`}
              className="gantt-arrow"
              points={arrow.points.map((p) => `${p.x},${p.y}`).join(' ')}
              markerEnd="url(#gantt-arrowhead)"
            />
          ))}

          {/* バー / サマリー / マイルストーン */}
          {layout.rows.map((row) => (
            <Bar
              key={row.id}
              row={row}
              selected={row.id === selectedId}
              onSelect={onSelectBar}
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
  onSelect: (id: string) => void
}

/** 1 行ぶんのバー(kind に応じて task / summary / milestone を描き分ける) */
function Bar({ row, selected, onSelect }: BarProps) {
  const handleClick = (): void => onSelect(row.id)
  const selectedClass = selected ? ' selected' : ''

  if (row.kind === 'milestone') {
    const half = row.barHeight / 2
    const points = [
      `${row.cx},${row.cy - half}`,
      `${row.cx + half},${row.cy}`,
      `${row.cx},${row.cy + half}`,
      `${row.cx - half},${row.cy}`,
    ].join(' ')
    return (
      <polygon
        className={`gantt-milestone${selectedClass}`}
        points={points}
        onClick={handleClick}
      />
    )
  }

  if (row.kind === 'summary') {
    const summaryHeight = Math.max(6, Math.round(row.barHeight * 0.45))
    const summaryY = row.cy - summaryHeight / 2
    return (
      <rect
        className={`gantt-summary${selectedClass}`}
        x={row.x}
        y={summaryY}
        width={row.width}
        height={summaryHeight}
        rx={2}
        onClick={handleClick}
      />
    )
  }

  // task
  return (
    <g onClick={handleClick} className="gantt-bar-group">
      <rect
        className={`gantt-bar${selectedClass}`}
        x={row.x}
        y={row.barY}
        width={row.width}
        height={row.barHeight}
        rx={4}
      />
      {row.progressWidth > 0 ? (
        <rect
          className="gantt-progress"
          x={row.x}
          y={row.barY}
          width={row.progressWidth}
          height={row.barHeight}
          rx={4}
        />
      ) : null}
    </g>
  )
}

export default GanttChart
