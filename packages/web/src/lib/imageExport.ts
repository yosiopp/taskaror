/**
 * ファイルダウンロードと画像変換のブラウザユーティリティ。
 * Blob / テキストのダウンロードと、SVG 文字列の PNG 変換(canvas 経由)を提供する。
 */

/** Blob をファイルとしてダウンロードさせる(ブラウザ専用) */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** テキストをファイルとしてダウンロードさせる(ブラウザ専用) */
export function downloadText(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: 'text/yaml;charset=utf-8' }), fileName)
}

/**
 * SVG 文字列を PNG の Blob に変換する(canvas 経由。ブラウザ専用)。
 * devicePixelRatio で高解像度化する(メモリ過大を避けるため上限 2 倍)。
 * 画像サイズは SVG が持つ width/height から取得する。
 */
export function ganttSvgToPngBlob(svgString: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('ブラウザ環境が必要です'))
      return
    }
    const scale = Math.min(
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
      2,
    )
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const url = URL.createObjectURL(svgBlob)
    const image = new Image()
    image.onload = (): void => {
      const w = image.naturalWidth || image.width
      const h = image.naturalHeight || image.height
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (ctx === null)
          throw new Error('canvas 2D コンテキストを取得できません')
        ctx.scale(scale, scale)
        ctx.drawImage(image, 0, 0)
        canvas.toBlob((out) => {
          URL.revokeObjectURL(url)
          if (out) resolve(out)
          else reject(new Error('PNG の生成に失敗しました'))
        }, 'image/png')
      } catch (thrown) {
        URL.revokeObjectURL(url)
        reject(thrown instanceof Error ? thrown : new Error(String(thrown)))
      }
    }
    image.onerror = (): void => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG の画像化に失敗しました'))
    }
    image.src = url
  })
}
