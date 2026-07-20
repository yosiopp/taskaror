import { describe, expect, it } from 'vitest'
import { svgSize, wrapSvgHtml } from './ganttExport'

describe('svgSize', () => {
  it('renderGanttSvg 形式のルート要素から寸法を取り出す', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="382"' +
      ' viewBox="0 0 1240 382" font-family="sans-serif"></svg>'
    expect(svgSize(svg)).toEqual({ width: 1240, height: 382 })
  })

  it('寸法が読み取れなければ null を返す', () => {
    expect(svgSize('<svg viewBox="0 0 10 10"></svg>')).toBeNull()
    expect(svgSize('こんにちは')).toBeNull()
  })
})

describe('wrapSvgHtml', () => {
  it('SVG 本体と 1 ページに収める @page 指定を含む HTML を返す', () => {
    const html = wrapSvgHtml('<svg width="10" height="20"></svg>', {
      width: 10,
      height: 20,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<svg width="10" height="20"></svg>')
    expect(html).toContain('@page { size: 10px 20px; margin: 0; }')
  })
})
