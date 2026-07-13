/**
 * 左グリッドと右ガントの境界に置くスプリッタ(セパレータ)。
 * app-body(position: relative)に対する絶対配置のオーバーレイで、常に境界上に表示される。
 * ドラッグ・左右キー・ダブルクリック(既定幅リセット)でグリッド幅を変更する。
 * 幅の確定値は onCommitWidth 経由で永続化する(App が localStorage に保存)。
 */
import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { GRID_WIDTH } from './constants'
import { GRID_WIDTH_MIN, clampGridWidth, maxGridWidth } from './paneWidth'

/** 左右キーでの微調整幅(Shift 併用で大きく動かす) */
const KEY_STEP = 16
const KEY_STEP_LARGE = 48

interface PaneSeparatorProps {
  /** 現在のグリッド幅(px) */
  gridWidth: number
  /** 幅の基準になるコンテナ(app-body)。左端からの相対座標で幅を決める */
  containerRef: RefObject<HTMLDivElement | null>
  /** ドラッグ中などの即時反映(state 更新のみ) */
  onResize: (width: number) => void
  /** 確定した幅(ドラッグ終了・キー操作・リセット)。永続化に使う */
  onCommitWidth: (width: number) => void
}

/** 現在のウィンドウ幅から上限を求める(SSR では既定幅を上限扱い) */
function currentMax(): number {
  if (typeof window === 'undefined') return GRID_WIDTH
  return maxGridWidth(window.innerWidth)
}

function PaneSeparator(props: PaneSeparatorProps) {
  const { gridWidth, containerRef, onResize, onCommitWidth } = props
  const draggingRef = useRef(false)

  /** clientX をコンテナ左端からの幅に変換してクランプする */
  const widthFromClientX = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    const raw = rect ? clientX - rect.left : gridWidth
    return clampGridWidth(raw, currentMax())
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // テキスト選択やフォーカス移動を抑止しつつドラッグを開始する
    event.preventDefault()
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-resizing-cols')
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    onResize(widthFromClientX(event.clientX))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.classList.remove('is-resizing-cols')
    onCommitWidth(widthFromClientX(event.clientX))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = gridWidth - step
    else if (event.key === 'ArrowRight') next = gridWidth + step
    else if (event.key === 'Home') next = GRID_WIDTH_MIN
    else if (event.key === 'End') next = currentMax()
    if (next === null) return
    event.preventDefault()
    onCommitWidth(clampGridWidth(next, currentMax()))
  }

  // ダブルクリックで既定幅に戻す
  const handleDoubleClick = (): void => {
    onCommitWidth(clampGridWidth(GRID_WIDTH, currentMax()))
  }

  return (
    <div
      className="pane-separator"
      role="separator"
      aria-orientation="vertical"
      aria-label="タスク一覧とガントの境界。ドラッグまたは左右キーで幅を調整"
      aria-valuenow={Math.round(gridWidth)}
      aria-valuemin={GRID_WIDTH_MIN}
      aria-valuemax={currentMax()}
      tabIndex={0}
      style={{ left: gridWidth }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
    >
      <span className="pane-separator-line" aria-hidden="true" />
    </div>
  )
}

export default PaneSeparator
