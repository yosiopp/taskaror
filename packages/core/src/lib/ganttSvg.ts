/**
 * ガントチャートを「完全に自己完結した(外部 CSS 非依存の)SVG 文字列」に
 * 書き出す純粋関数。React・DOM・ブラウザ API に依存しないため、UI からの
 * エクスポートだけでなく、CLI の svg / png / pdf コマンドからも再利用する。
 *
 * computeGanttLayout が返す GanttLayout の座標をそのまま使い、色・フォントは
 * インラインの具体値で埋める(テーマ変数に依存しない)。左端にはタスク名の
 * ラベル列を付けて、画像単体でも意味が分かるようにする。
 */
import type { GanttLayout, GanttRowLayout } from './gantt'

/** 図中の各要素の色。すべて具体値で持ち、テーマ変数に依存しない */
export interface GanttSvgColors {
  /** 図全体の背景 */
  background: string
  /** 左ラベル列の背景 */
  labelPanel: string
  /** 週末列のシェード */
  weekend: string
  /** 行の横罫線 */
  rowLine: string
  /** ヘッダ・区切りの線 */
  headerLine: string
  /** 月ラベル文字 */
  monthLabel: string
  /** 日ラベル文字 */
  dayLabel: string
  /** 今日線 */
  today: string
  /** タスクバー */
  bar: string
  /** 進捗オーバーレイ */
  progress: string
  /** サマリー(親)バー */
  summary: string
  /** マイルストーン(ひし形) */
  milestone: string
  /** 依存矢印 */
  arrow: string
  /** タスク名ラベル文字 */
  text: string
}

/** ラベル列に出すタスク名の階層インデント算出に使う、行ごとの補足情報 */
export interface GanttSvgLabel {
  /** GanttRowLayout.id と対応させる */
  id: string
  /** 階層の深さ(ルート = 0)。インデント量に使う */
  depth: number
}

export interface GanttSvgOptions {
  /** 色パレットの差し替え(未指定は既定パレット) */
  colors?: Partial<GanttSvgColors>
  /** 左タスク名ラベル列の幅(px)。既定 220 */
  labelWidth?: number
  /** 時間軸ヘッダの高さ(px)。既定 48 */
  headerHeight?: number
  /** ヘッダのうち月ラベル帯の高さ(px)。既定 20 */
  monthBandHeight?: number
  /** フォントファミリ(未指定はシステムフォント) */
  fontFamily?: string
}

/** 既定パレット(light テーマ相当の固定値。テーマ変数には依存しない) */
const DEFAULT_COLORS: GanttSvgColors = {
  background: '#ffffff',
  labelPanel: '#f6f8fa',
  weekend: 'rgba(0, 0, 0, 0.045)',
  rowLine: 'rgba(0, 0, 0, 0.06)',
  headerLine: '#d0d7de',
  monthLabel: '#57606a',
  dayLabel: '#57606a',
  today: '#e5534b',
  bar: '#6ca8ff',
  progress: '#2563eb',
  summary: '#57606a',
  milestone: '#8250df',
  arrow: '#8d96a0',
  text: '#1f2328',
}

const DEFAULT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const DEFAULT_LABEL_WIDTH = 220
// ヘッダ高の既定値。web のガント表示(constants.ts で re-export)とも共有する
/** 時間軸ヘッダの px 高の既定値 */
export const DEFAULT_HEADER_HEIGHT = 48
/** ヘッダのうち月ラベル帯の px 高の既定値 */
export const DEFAULT_MONTH_BAND_HEIGHT = 20

/**
 * GanttLayout を自己完結した SVG 文字列に描画する。
 * 全期間(layout.days 全体)を出力し、可視窓(仮想化)には依存しない。
 * labels は行ごとの階層深さを与える(id で GanttRowLayout と対応。無ければ深さ 0)。
 */
export function renderGanttSvg(
  layout: GanttLayout,
  labels: GanttSvgLabel[] = [],
  options: GanttSvgOptions = {},
): string {
  const colors = { ...DEFAULT_COLORS, ...(options.colors ?? {}) }
  const labelWidth = options.labelWidth ?? DEFAULT_LABEL_WIDTH
  const headerHeight = options.headerHeight ?? DEFAULT_HEADER_HEIGHT
  const monthBandHeight = options.monthBandHeight ?? DEFAULT_MONTH_BAND_HEIGHT
  const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY
  const dayBandHeight = headerHeight - monthBandHeight
  const { dayWidth, width: chartWidth, height: chartHeight } = layout

  const totalWidth = labelWidth + chartWidth
  const totalHeight = headerHeight + chartHeight

  const depthById = new Map<string, number>()
  for (const label of labels) depthById.set(label.id, label.depth)

  const parts: string[] = []

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}"` +
      ` height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}"` +
      ` font-family="${escapeXml(fontFamily)}">`,
  )

  // defs: 依存矢印の矢じり + ラベル列のはみ出しクリップ
  parts.push(
    `<defs>` +
      `<marker id="gantt-export-arrow" markerWidth="7" markerHeight="7"` +
      ` refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">` +
      `<path d="M0,0 L6,3 L0,6 Z" fill="${colors.arrow}"/></marker>` +
      `<clipPath id="gantt-export-label-clip">` +
      `<rect x="0" y="0" width="${labelWidth}" height="${chartHeight}"/>` +
      `</clipPath>` +
      `</defs>`,
  )

  // 背景 + ラベル列の背景
  parts.push(
    `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}"` +
      ` fill="${colors.background}"/>`,
  )
  parts.push(
    `<rect x="0" y="0" width="${labelWidth}" height="${totalHeight}"` +
      ` fill="${colors.labelPanel}"/>`,
  )

  // 時間軸ヘッダ(chart 領域。X をラベル列ぶんずらす)
  parts.push(`<g transform="translate(${labelWidth}, 0)">`)
  for (const day of layout.days) {
    if (!day.isWeekend) continue
    parts.push(
      `<rect x="${day.x}" y="${monthBandHeight}" width="${dayWidth}"` +
        ` height="${dayBandHeight}" fill="${colors.weekend}"/>`,
    )
  }
  for (const month of layout.months) {
    parts.push(
      `<line x1="${month.x}" y1="0" x2="${month.x}" y2="${headerHeight}"` +
        ` stroke="${colors.headerLine}" stroke-width="1"/>`,
    )
    parts.push(
      `<text x="${month.x + 6}" y="${monthBandHeight - 6}"` +
        ` fill="${colors.monthLabel}" font-size="11" font-weight="600">` +
        `${escapeXml(month.label)}</text>`,
    )
  }
  for (const day of layout.days) {
    const opacity = day.isWeekend ? ' opacity="0.6"' : ''
    parts.push(
      `<text x="${day.x + dayWidth / 2}"` +
        ` y="${monthBandHeight + dayBandHeight / 2 + 4}"` +
        ` fill="${colors.dayLabel}" font-size="10" text-anchor="middle"` +
        `${opacity}>${Number(day.date.slice(8, 10))}</text>`,
    )
  }
  parts.push(
    `<line x1="0" y1="${monthBandHeight}" x2="${chartWidth}"` +
      ` y2="${monthBandHeight}" stroke="${colors.headerLine}" stroke-width="1"/>`,
  )
  parts.push(`</g>`)

  // 本文(chart 領域。X をラベル列ぶん、Y をヘッダぶんずらす)
  parts.push(`<g transform="translate(${labelWidth}, ${headerHeight})">`)
  for (const day of layout.days) {
    if (!day.isWeekend) continue
    parts.push(
      `<rect x="${day.x}" y="0" width="${dayWidth}" height="${chartHeight}"` +
        ` fill="${colors.weekend}"/>`,
    )
  }
  for (const row of layout.rows) {
    const lineY = row.y + layout.rowHeight
    parts.push(
      `<line x1="0" y1="${lineY}" x2="${chartWidth}" y2="${lineY}"` +
        ` stroke="${colors.rowLine}" stroke-width="1"/>`,
    )
  }
  if (layout.todayX !== null) {
    parts.push(
      `<line x1="${layout.todayX}" y1="0" x2="${layout.todayX}"` +
        ` y2="${chartHeight}" stroke="${colors.today}" stroke-width="1.5"` +
        ` stroke-dasharray="3 2"/>`,
    )
  }
  for (const arrow of layout.arrows) {
    const points = arrow.points.map((p) => `${p.x},${p.y}`).join(' ')
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${colors.arrow}"` +
        ` stroke-width="1.25" marker-end="url(#gantt-export-arrow)"/>`,
    )
  }
  for (const row of layout.rows) parts.push(renderBar(row, colors))
  parts.push(`</g>`)

  // 左タスク名ラベル列(はみ出しは clip で切る)
  parts.push(
    `<g transform="translate(0, ${headerHeight})"` +
      ` clip-path="url(#gantt-export-label-clip)">`,
  )
  for (const row of layout.rows) {
    const depth = depthById.get(row.id) ?? 0
    const indent = 8 + depth * 14
    parts.push(
      `<text x="${indent}" y="${row.cy + 4}" fill="${colors.text}"` +
        ` font-size="12">${escapeXml(row.title || '(無題)')}</text>`,
    )
  }
  parts.push(`</g>`)

  // ラベル列と chart の境界線 + ヘッダ下の区切り線(全幅)
  parts.push(
    `<line x1="${labelWidth}" y1="0" x2="${labelWidth}" y2="${totalHeight}"` +
      ` stroke="${colors.headerLine}" stroke-width="1"/>`,
  )
  parts.push(
    `<line x1="0" y1="${headerHeight}" x2="${totalWidth}" y2="${headerHeight}"` +
      ` stroke="${colors.headerLine}" stroke-width="1"/>`,
  )

  parts.push(`</svg>`)
  return parts.join('')
}

/** 1 行ぶんのバー(task / summary / milestone)を SVG 断片にする */
function renderBar(row: GanttRowLayout, colors: GanttSvgColors): string {
  const idAttr = ` data-gantt-bar="${escapeXml(row.id)}"`

  if (row.kind === 'milestone') {
    const half = row.barHeight / 2
    const points = [
      `${row.cx},${row.cy - half}`,
      `${row.cx + half},${row.cy}`,
      `${row.cx},${row.cy + half}`,
      `${row.cx - half},${row.cy}`,
    ].join(' ')
    return `<polygon points="${points}" fill="${colors.milestone}"${idAttr}/>`
  }

  if (row.kind === 'summary') {
    const height = Math.max(6, Math.round(row.barHeight * 0.45))
    const y = row.cy - height / 2
    return (
      `<rect x="${row.x}" y="${y}" width="${row.width}" height="${height}"` +
      ` rx="2" fill="${colors.summary}"${idAttr}/>`
    )
  }

  // task: 本体 + 進捗オーバーレイ
  let svg =
    `<rect x="${row.x}" y="${row.barY}" width="${row.width}"` +
    ` height="${row.barHeight}" rx="4" fill="${colors.bar}"${idAttr}/>`
  if (row.progressWidth > 0) {
    svg +=
      `<rect x="${row.x}" y="${row.barY}" width="${row.progressWidth}"` +
      ` height="${row.barHeight}" rx="4" fill="${colors.progress}"/>`
  }
  return svg
}

/** SVG(XML)に安全に埋め込めるよう特殊文字をエスケープする */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
