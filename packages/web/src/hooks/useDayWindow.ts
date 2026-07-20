import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { computeDayWindow } from '@taskaror/core/gantt'
import type { DayWindow, GanttLayout } from '@taskaror/core/gantt'
import { GANTT_DAY_OVERSCAN } from '../components/constants'
import type { ViewMode } from '../components/Toolbar'

/**
 * ガント日カラムの仮想化(可視範囲だけ描く)。
 * 共有スクロール容器(.editor-scroll)の scrollLeft と可視幅を追跡し、frozen な
 * グリッド幅を差し引いたガント領域の可視 X 範囲を日インデックス窓に変換する。
 * これで総期間が長くても、描く日カラムを viewport 相当に抑えられる。
 * 返した editorScrollRef をスクロール容器に張ること(ガント編集ビューのみ)。
 */
export function useDayWindow(
  viewMode: ViewMode,
  gridWidth: number,
  layout: GanttLayout,
): {
  editorScrollRef: RefObject<HTMLDivElement | null>
  dayWindow: DayWindow | null
} {
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const [scrollMetrics, setScrollMetrics] = useState<{
    scrollLeft: number
    clientWidth: number
  }>(() => ({
    scrollLeft: 0,
    // 初回レンダーでも概ね正しい窓を出せるよう、ウィンドウ幅で近似する(SSR は 0)。
    clientWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
  }))

  // スクロール容器の scrollLeft / clientWidth を onScroll + ResizeObserver で追跡する。
  // 更新は rAF スロットルし、値が変わったときだけ state を更新して再描画を抑える。
  useEffect(() => {
    const element = editorScrollRef.current
    if (element === null) return
    let frame = 0
    const measure = (): void => {
      frame = 0
      setScrollMetrics((prev) =>
        prev.scrollLeft === element.scrollLeft &&
        prev.clientWidth === element.clientWidth
          ? prev
          : {
              scrollLeft: element.scrollLeft,
              clientWidth: element.clientWidth,
            },
      )
    }
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure() // 初期計測(マウント直後・ビュー切り替え直後)
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [viewMode])

  // 可視 X 範囲 → 日インデックス窓(オーバースキャン付き)。clientWidth 未計測(0)の
  // 間はフル描画にフォールバックする(SSR など)。
  const dayWindow = useMemo<DayWindow | null>(() => {
    if (scrollMetrics.clientWidth <= 0) return null
    const ganttViewport = Math.max(0, scrollMetrics.clientWidth - gridWidth)
    const xStart = scrollMetrics.scrollLeft
    const xEnd = scrollMetrics.scrollLeft + ganttViewport
    return computeDayWindow(
      layout.days.length,
      layout.dayWidth,
      xStart,
      xEnd,
      GANTT_DAY_OVERSCAN,
    )
  }, [scrollMetrics, gridWidth, layout.days.length, layout.dayWidth])

  return { editorScrollRef, dayWindow }
}
