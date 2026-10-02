/**
 * taskaror のアプリアイコン(ヘッダでアプリ名の代わりに表示する)。
 * 自己完結性のためインライン SVG で埋め込み、currentColor で描くので
 * ライト / ダークの文字色に追従する。
 * 図形は public/favicon.svg と同じ(変更するときは docs/site/docs/public の
 * favicon.svg / logo-light.svg / logo-dark.svg も揃える)。
 */
import type { ReactElement } from 'react'
import { APP_NAME } from '../appInfo'

export function AppIcon({
  size = 24,
  className,
}: {
  size?: number
  className?: string
}): ReactElement {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      // アプリ名のテキスト表示を置き換えるため、読み上げ用にアプリ名を持たせる
      role="img"
      aria-label={APP_NAME}
      focusable="false"
    >
      <title>{APP_NAME}</title>
      <path
        d="M23 9V39.5c0 7.5 4 11.5 10.5 11.5c3 0 5-.4 7-1.2M11 23H48"
        strokeLinejoin="round"
      />
      <path d="M39 13l10 10-10 10" />
      <path
        d="M11 19.5C16 19 19 15.5 19.5 9H22V22H11z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}
