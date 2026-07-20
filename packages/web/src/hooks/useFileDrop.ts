import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

/** ドロップを受ける要素に張るハンドラ一式(スプレッドで渡す) */
export interface FileDropHandlers {
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
}

/**
 * ファイルのドラッグ&ドロップ(画面全体で受ける)。
 * 子要素をまたぐたびに dragenter/dragleave が発火するため、深さを数えて
 * 全体から出たとき(0 になったとき)だけオーバーレイ(dragActive)を閉じる。
 * ドロップされたファイルは onFile に渡す(複数あれば先頭のみ)。
 */
export function useFileDrop(onFile: (file: File) => void): {
  dragActive: boolean
  dragHandlers: FileDropHandlers
} {
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  const isFileDrag = (event: DragEvent<HTMLDivElement>): boolean =>
    event.dataTransfer.types.includes('Files')

  const onDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault() // drop を許可するために必要
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return {
    dragActive,
    dragHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
