import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  addDays,
  adjustToBusinessDay,
  businessDayEnd,
  businessDaysBetween,
  formatDate,
  isWeekend,
  maxDate,
  minDate,
  parseDate,
} from './date'

// 2026-07-13(月)〜 2026-07-20(月)を基準にする
const MON = '2026-07-13'
const FRI = '2026-07-17'
const SAT = '2026-07-18'
const SUN = '2026-07-19'
const NEXT_MON = '2026-07-20'

describe('parseDate / formatDate', () => {
  it('YYYY-MM-DD を往復できる', () => {
    expect(formatDate(parseDate(MON))).toBe(MON)
  })

  it('形式が不正なら例外を投げる', () => {
    expect(() => parseDate('2026/07/13')).toThrow()
    expect(() => parseDate('2026-7-13')).toThrow()
  })
})

describe('isWeekend / adjustToBusinessDay', () => {
  it('土日を判定する', () => {
    expect(isWeekend(parseDate(FRI))).toBe(false)
    expect(isWeekend(parseDate(SAT))).toBe(true)
    expect(isWeekend(parseDate(SUN))).toBe(true)
  })

  it('土日は翌営業日にずらす', () => {
    expect(formatDate(adjustToBusinessDay(parseDate(SAT)))).toBe(NEXT_MON)
    expect(formatDate(adjustToBusinessDay(parseDate(SUN)))).toBe(NEXT_MON)
    expect(formatDate(adjustToBusinessDay(parseDate(FRI)))).toBe(FRI)
  })
})

describe('addDays / addBusinessDays', () => {
  it('暦日を加算する', () => {
    expect(formatDate(addDays(parseDate(FRI), 3))).toBe('2026-07-20')
  })

  it('営業日を加算し土日を飛ばす', () => {
    expect(formatDate(addBusinessDays(parseDate(FRI), 0))).toBe(FRI)
    expect(formatDate(addBusinessDays(parseDate(FRI), 1))).toBe(NEXT_MON)
    expect(formatDate(addBusinessDays(parseDate(MON), 5))).toBe('2026-07-20')
  })
})

describe('businessDayEnd', () => {
  it('マイルストーン(0d)は終了日 = 開始日', () => {
    expect(formatDate(businessDayEnd(parseDate(MON), 0))).toBe(MON)
  })

  it('1 営業日は当日終わり', () => {
    expect(formatDate(businessDayEnd(parseDate(MON), 1))).toBe(MON)
  })

  it('週をまたぐ期間は土日を飛ばす', () => {
    // 月から 5 営業日 -> 月火水木金 で金曜終わり
    expect(formatDate(businessDayEnd(parseDate(MON), 5))).toBe(FRI)
    // 月から 6 営業日 -> 翌月曜終わり
    expect(formatDate(businessDayEnd(parseDate(MON), 6))).toBe(NEXT_MON)
  })
})

describe('businessDaysBetween', () => {
  it('両端を含む営業日数を数える', () => {
    expect(businessDaysBetween(parseDate(MON), parseDate(MON))).toBe(1)
    expect(businessDaysBetween(parseDate(MON), parseDate(FRI))).toBe(5)
    // 金〜翌月は土日を除いて 2 営業日
    expect(businessDaysBetween(parseDate(FRI), parseDate(NEXT_MON))).toBe(2)
  })
})

describe('maxDate / minDate', () => {
  it('新しい方/古い方を返す', () => {
    const a = parseDate(MON)
    const b = parseDate(FRI)
    expect(formatDate(maxDate(a, b))).toBe(FRI)
    expect(formatDate(minDate(a, b))).toBe(MON)
  })
})
