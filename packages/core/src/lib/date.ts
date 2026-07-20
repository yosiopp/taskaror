/**
 * 日付ユーティリティ。営業日(土日スキップ)ベースで期間を計算する。
 * 祝日など追加の除外日は HolidaySet(TaskSpec の info.holidays)として
 * 各関数に渡すと土日と同様にスキップされる。省略時は土日のみ。
 *
 * 内部では日付を UTC 0 時の Date として扱い、タイムゾーンや夏時間の
 * 影響を受けずに日単位の加算・比較ができるようにしている。
 */

const MS_PER_DAY = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 営業日から除外する日付("YYYY-MM-DD")の集合。info.holidays に対応する */
export type HolidaySet = ReadonlySet<string>

const NO_HOLIDAYS: HolidaySet = new Set()

/** info.holidays(日付文字列の配列)を HolidaySet に変換する。未指定は空集合 */
export function toHolidaySet(dates?: readonly string[]): HolidaySet {
  return dates !== undefined && dates.length > 0 ? new Set(dates) : NO_HOLIDAYS
}

/** "YYYY-MM-DD" を UTC 0 時の Date に変換する */
export function parseDate(text: string): Date {
  const matched = DATE_RE.exec(text)
  if (matched === null) {
    throw new Error(`日付の形式が不正です: ${text}`)
  }
  return new Date(
    Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])),
  )
}

/** Date を "YYYY-MM-DD" に変換する */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** ローカルの今日を UTC 0 時の Date として返す */
export function today(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
}

/** n 日後(暦日)を返す。n は負数も可 */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY)
}

/** 土日かどうか */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

/** 土日または除外日(holidays)かどうか。営業日でない日を表す */
export function isNonBusinessDay(
  date: Date,
  holidays: HolidaySet = NO_HOLIDAYS,
): boolean {
  return isWeekend(date) || holidays.has(formatDate(date))
}

/** 土日・除外日なら翌営業日にずらす。営業日ならそのまま返す */
export function adjustToBusinessDay(
  date: Date,
  holidays: HolidaySet = NO_HOLIDAYS,
): Date {
  let result = date
  while (isNonBusinessDay(result, holidays)) {
    result = addDays(result, 1)
  }
  return result
}

/**
 * 営業日を n 日進める(n >= 0)。土日・除外日はカウントしない。
 * 開始日は営業日であることを前提とする。addBusinessDays(d, 0) === d。
 */
export function addBusinessDays(
  date: Date,
  n: number,
  holidays: HolidaySet = NO_HOLIDAYS,
): Date {
  let result = date
  let remaining = n
  while (remaining > 0) {
    result = addDays(result, 1)
    if (!isNonBusinessDay(result, holidays)) remaining -= 1
  }
  return result
}

/**
 * 営業日を n 日ずらす(n は負数も可)。土日・除外日はまたいで数える。
 * 起点が営業日であることを前提とする。shiftBusinessDays(d, 0) === d。
 */
export function shiftBusinessDays(
  date: Date,
  n: number,
  holidays: HolidaySet = NO_HOLIDAYS,
): Date {
  let result = date
  let remaining = Math.abs(n)
  const step = n < 0 ? -1 : 1
  while (remaining > 0) {
    result = addDays(result, step)
    if (!isNonBusinessDay(result, holidays)) remaining -= 1
  }
  return result
}

/**
 * 営業日 days 日ぶんの期間の終了日を返す。
 * 開始日は営業日であることを前提とする。days <= 0(マイルストーン)は終了日 = 開始日。
 */
export function businessDayEnd(
  start: Date,
  days: number,
  holidays: HolidaySet = NO_HOLIDAYS,
): Date {
  if (days <= 0) return start
  return addBusinessDays(start, days - 1, holidays)
}

/** start から end までに含まれる営業日数(両端を含む)。start <= end を前提とする */
export function businessDaysBetween(
  start: Date,
  end: Date,
  holidays: HolidaySet = NO_HOLIDAYS,
): number {
  let count = 0
  let cursor = start
  while (cursor.getTime() <= end.getTime()) {
    if (!isNonBusinessDay(cursor, holidays)) count += 1
    cursor = addDays(cursor, 1)
  }
  return count
}

export function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

export function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b
}
