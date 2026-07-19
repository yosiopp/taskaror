import { describe, expect, it } from 'vitest'
import { estimateToBusinessDays, parseEstimateHours } from './estimate'

describe('parseEstimateHours', () => {
  it('日単位を工数時間に変換する(1d = 8h)', () => {
    expect(parseEstimateHours('1d')).toBe(8)
    expect(parseEstimateHours('1.5d')).toBe(12)
    expect(parseEstimateHours('0.5d')).toBe(4)
  })

  it('時間単位はそのまま返す', () => {
    expect(parseEstimateHours('4h')).toBe(4)
    expect(parseEstimateHours('0.5h')).toBe(0.5)
  })

  it('形式が不正なら例外を投げる', () => {
    expect(() => parseEstimateHours('3週間')).toThrow()
    expect(() => parseEstimateHours('1')).toThrow()
    expect(() => parseEstimateHours('d')).toThrow()
  })

  it('整数部は 4 桁まで(巨大値によるスケジュール計算のハング防止)', () => {
    expect(parseEstimateHours('9999d')).toBe(9999 * 8)
    expect(() => parseEstimateHours('10000d')).toThrow()
    expect(() => parseEstimateHours('999999999999d')).toThrow()
  })
})

describe('estimateToBusinessDays', () => {
  it('工数時間を営業日数に切り上げる', () => {
    expect(estimateToBusinessDays('1d')).toBe(1)
    expect(estimateToBusinessDays('1.5d')).toBe(2) // 12h -> ceil(12/8) = 2
    expect(estimateToBusinessDays('4h')).toBe(1) // ceil(4/8) = 1
    expect(estimateToBusinessDays('8h')).toBe(1)
    expect(estimateToBusinessDays('9h')).toBe(2)
  })

  it('未指定は 0d(マイルストーン)', () => {
    expect(estimateToBusinessDays(undefined)).toBe(0)
  })
})
