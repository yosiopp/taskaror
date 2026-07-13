/**
 * 見積工数(estimate)の解釈。
 * estimate は経過時間ではなく工数を表す。1d = 8h 固定(決めごと参照)。
 */

/** 1 営業日あたりの工数時間。設定化はしない(決めごと) */
export const HOURS_PER_DAY = 8

const ESTIMATE_RE = /^(\d+(?:\.\d+)?)(h|d)$/

/** estimate("1.5d" / "4h")を工数時間に変換する。形式が不正なら例外を投げる */
export function parseEstimateHours(estimate: string): number {
  const matched = ESTIMATE_RE.exec(estimate.trim())
  if (matched === null) {
    throw new Error(`estimate の形式が不正です: ${estimate}`)
  }
  const value = Number(matched[1])
  return matched[2] === 'd' ? value * HOURS_PER_DAY : value
}

/**
 * estimate を期間(営業日数)に変換する。
 * 期間 = ceil(工数時間 / 8h)。estimate 未指定は 0d(マイルストーン)。
 */
export function estimateToBusinessDays(estimate: string | undefined): number {
  if (estimate === undefined) return 0
  return Math.ceil(parseEstimateHours(estimate) / HOURS_PER_DAY)
}
