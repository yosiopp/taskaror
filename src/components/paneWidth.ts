/**
 * 左グリッド幅の算出まわりの純粋関数。DOM / React には依存しないので単体テストできる。
 * localStorage の読み書きなどブラウザ依存の処理は呼び出し側(App / セパレータ)が持つ。
 */

/** グリッド幅の下限(px)。これ以上は狭められない */
export const GRID_WIDTH_MIN = 360

/** グリッド幅の上限をウィンドウ幅の何割にするか */
export const GRID_WIDTH_MAX_RATIO = 0.7

/** ウィンドウ幅から許容する最大グリッド幅(px)を求める。最小幅は必ず確保する */
export function maxGridWidth(viewportWidth: number): number {
  const ratioMax = Math.round(viewportWidth * GRID_WIDTH_MAX_RATIO)
  return Math.max(GRID_WIDTH_MIN, ratioMax)
}

/** グリッド幅を [GRID_WIDTH_MIN, max] に丸め込む。NaN 等は最小幅に落とす */
export function clampGridWidth(width: number, max: number): number {
  const upper = Math.max(GRID_WIDTH_MIN, max)
  if (!Number.isFinite(width)) return GRID_WIDTH_MIN
  return Math.min(Math.max(Math.round(width), GRID_WIDTH_MIN), upper)
}

/**
 * localStorage から読んだ生文字列を検証してグリッド幅に変換する。
 * 未保存・数値でない・範囲外はすべて fallback(をクランプした値)に落とす。
 */
export function parseStoredGridWidth(
  raw: string | null,
  max: number,
  fallback: number,
): number {
  if (raw === null) return clampGridWidth(fallback, max)
  const value = Number(raw)
  if (!Number.isFinite(value)) return clampGridWidth(fallback, max)
  return clampGridWidth(value, max)
}
