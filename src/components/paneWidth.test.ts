import { describe, expect, it } from 'vitest'
import {
  GRID_WIDTH_MIN,
  clampGridWidth,
  maxGridWidth,
  parseStoredGridWidth,
} from './paneWidth'

describe('maxGridWidth', () => {
  it('ウィンドウ幅の 7 割を上限にする', () => {
    expect(maxGridWidth(1000)).toBe(700)
  })

  it('狭いウィンドウでも最小幅は下回らない', () => {
    expect(maxGridWidth(200)).toBe(GRID_WIDTH_MIN)
  })
})

describe('clampGridWidth', () => {
  it('範囲内はそのまま(四捨五入)', () => {
    expect(clampGridWidth(500, 900)).toBe(500)
    expect(clampGridWidth(500.4, 900)).toBe(500)
  })

  it('最小未満は最小に丸める', () => {
    expect(clampGridWidth(100, 900)).toBe(GRID_WIDTH_MIN)
  })

  it('最大超過は最大に丸める', () => {
    expect(clampGridWidth(1000, 900)).toBe(900)
  })

  it('max が最小未満でも最小を割らない', () => {
    expect(clampGridWidth(500, 100)).toBe(GRID_WIDTH_MIN)
  })

  it('NaN / Infinity は最小に落とす', () => {
    expect(clampGridWidth(Number.NaN, 900)).toBe(GRID_WIDTH_MIN)
    expect(clampGridWidth(Number.POSITIVE_INFINITY, 900)).toBe(GRID_WIDTH_MIN)
  })
})

describe('parseStoredGridWidth', () => {
  it('未保存(null)は fallback を返す', () => {
    expect(parseStoredGridWidth(null, 900, 560)).toBe(560)
  })

  it('数値でない文字列は fallback を返す', () => {
    expect(parseStoredGridWidth('abc', 900, 560)).toBe(560)
  })

  it('妥当な数値はクランプして返す', () => {
    expect(parseStoredGridWidth('420', 900, 560)).toBe(420)
    expect(parseStoredGridWidth('9999', 900, 560)).toBe(900)
    expect(parseStoredGridWidth('10', 900, 560)).toBe(GRID_WIDTH_MIN)
  })
})
