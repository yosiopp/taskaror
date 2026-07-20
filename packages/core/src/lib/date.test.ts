import { describe, expect, it } from 'vitest'
import {
  addBusinessDays,
  addDays,
  adjustToBusinessDay,
  businessDayEnd,
  businessDaysBetween,
  formatDate,
  isNonBusinessDay,
  isWeekend,
  maxDate,
  minDate,
  parseDate,
  shiftBusinessDays,
  toHolidaySet,
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

describe('shiftBusinessDays', () => {
  it('n=0 はそのまま返す', () => {
    expect(formatDate(shiftBusinessDays(parseDate(MON), 0))).toBe(MON)
  })

  it('正方向は土日を飛ばして進める', () => {
    // 金 + 1 営業日 -> 翌月曜
    expect(formatDate(shiftBusinessDays(parseDate(FRI), 1))).toBe(NEXT_MON)
  })

  it('負方向は土日を飛ばして戻す', () => {
    // 翌月曜 - 1 営業日 -> 金
    expect(formatDate(shiftBusinessDays(parseDate(NEXT_MON), -1))).toBe(FRI)
    // 月 - 1 営業日 -> 前週金曜
    expect(formatDate(shiftBusinessDays(parseDate(MON), -1))).toBe('2026-07-10')
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

describe('除外日(HolidaySet)', () => {
  // 2026-07-15(水)を除外日にする
  const HOLIDAYS = toHolidaySet(['2026-07-15'])

  it('toHolidaySet は未指定・空配列で空集合を返す', () => {
    expect(toHolidaySet().size).toBe(0)
    expect(toHolidaySet([]).size).toBe(0)
    expect(toHolidaySet(['2026-07-15']).has('2026-07-15')).toBe(true)
  })

  it('isNonBusinessDay は土日と除外日を営業日でないと判定する', () => {
    expect(isNonBusinessDay(parseDate(SAT), HOLIDAYS)).toBe(true)
    expect(isNonBusinessDay(parseDate('2026-07-15'), HOLIDAYS)).toBe(true)
    expect(isNonBusinessDay(parseDate(MON), HOLIDAYS)).toBe(false)
    // 集合を省略すれば土日のみ
    expect(isNonBusinessDay(parseDate('2026-07-15'))).toBe(false)
  })

  it('adjustToBusinessDay は除外日を翌営業日にずらす(連続除外日も飛ばす)', () => {
    expect(
      formatDate(adjustToBusinessDay(parseDate('2026-07-15'), HOLIDAYS)),
    ).toBe('2026-07-16')
    // 金曜を除外すると土日を越えて月曜まで進む
    const friOff = toHolidaySet([FRI])
    expect(formatDate(adjustToBusinessDay(parseDate(FRI), friOff))).toBe(
      NEXT_MON,
    )
  })

  it('addBusinessDays / shiftBusinessDays は除外日をカウントしない', () => {
    // 火(14)+1 営業日 → 水(15)が除外日なので木(16)
    expect(
      formatDate(addBusinessDays(parseDate('2026-07-14'), 1, HOLIDAYS)),
    ).toBe('2026-07-16')
    expect(
      formatDate(shiftBusinessDays(parseDate('2026-07-16'), -1, HOLIDAYS)),
    ).toBe('2026-07-14')
  })

  it('businessDayEnd / businessDaysBetween は除外日を期間に数えない', () => {
    // 月(13)から 3 営業日 → 水(15)を飛ばして木(16)終わり
    expect(formatDate(businessDayEnd(parseDate(MON), 3, HOLIDAYS))).toBe(
      '2026-07-16',
    )
    expect(
      businessDaysBetween(parseDate(MON), parseDate('2026-07-16'), HOLIDAYS),
    ).toBe(3)
  })
})
