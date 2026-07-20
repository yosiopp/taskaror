/**
 * ツールバー用の Material Icons(自己完結性のためインライン SVG パスで埋め込む)。
 * Web フォント / CDN は使わず、24x24 のパスデータを currentColor で描く。
 */
import type { ReactElement } from 'react'

/** 各アイコンの 24x24 パスデータ(Material Icons 準拠) */
const PATHS = {
  /** タスク追加(add) */
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  /** タスク削除(delete) */
  delete:
    'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  /** インデント(format_indent_increase) */
  indent:
    'M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
  /** アウトデント(format_indent_decrease) */
  outdent:
    'M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
  /** 上へ移動(arrow_upward) */
  moveUp: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z',
  /** 下へ移動(arrow_downward) */
  moveDown: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z',
  /** フィルター(filter_list) */
  filter: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
} as const

export type IconName = keyof typeof PATHS

/** インライン SVG のアイコン。currentColor で塗るのでボタンの文字色に追従する */
export function Icon({
  name,
  size = 18,
}: {
  name: IconName
  size?: number
}): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
