/**
 * 見積工数(estimate)の解釈。
 * estimate は経過時間ではなく工数を表す。1d = 8h 固定(決めごと参照)。
 */

/** 1 営業日あたりの工数時間。設定化はしない(決めごと) */
export const HOURS_PER_DAY = 8

/**
 * estimate の形式(数値 + h/d)。整数部は 4 桁まで。
 * 巨大値で営業日計算(addBusinessDays)が止まらなくなるのを防ぐための上限で、
 * schema/1.0/taskspec.schema.json の estimate パターンと同期させること。
 */
export const ESTIMATE_RE = /^(\d{1,4}(?:\.\d+)?)(h|d)$/

/** estimate("1.5d" / "4h")を工数時間に変換する。形式が不正なら例外を投げる */
export function parseEstimateHours(estimate: string): number {
  const matched = ESTIMATE_RE.exec(estimate.trim())
  if (matched === null) {
    throw new Error(
      `estimate の形式が不正です(整数部 4 桁までの数値 + h/d): ${estimate}`,
    )
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
