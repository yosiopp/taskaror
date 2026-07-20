/**
 * gridColumns の純粋ロジック(カラムの表示/非表示・幅・localStorage 文字列の検証)のテスト。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRID_COLUMN_STATE,
  GRID_COLUMN_DEFS,
  GRID_COLUMN_MAX_WIDTH,
  columnWidth,
  gridTemplate,
  isColumnVisible,
  isDefaultColumnState,
  parseStoredGridColumnState,
  setColumnWidth,
  toggleColumn,
  totalColumnsWidth,
  visibleColumnDefs,
} from './gridColumns'

describe('カラム定義と既定状態', () => {
  it('カラム定義は重複なく、非表示にできるのは担当・タグ・進捗のみ', () => {
    const keys = GRID_COLUMN_DEFS.map((def) => def.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(
      GRID_COLUMN_DEFS.filter((def) => def.hideable).map((def) => def.key),
    ).toEqual(['assignees', 'tags', 'progress'])
  })

  it('既定状態はタグ列のみ非表示で、幅の変更なし', () => {
    expect(isColumnVisible(DEFAULT_GRID_COLUMN_STATE, 'tags')).toBe(false)
    expect(isColumnVisible(DEFAULT_GRID_COLUMN_STATE, 'assignees')).toBe(true)
    expect(isColumnVisible(DEFAULT_GRID_COLUMN_STATE, 'progress')).toBe(true)
    expect(isDefaultColumnState(DEFAULT_GRID_COLUMN_STATE)).toBe(true)
    expect(
      visibleColumnDefs(DEFAULT_GRID_COLUMN_STATE).map((def) => def.key),
    ).toEqual([
      'title',
      'estimate',
      'start',
      'assignees',
      'progress',
      'depends',
    ])
  })
})

describe('toggleColumn', () => {
  it('hideable な列の表示/非表示をトグルする', () => {
    const shown = toggleColumn(DEFAULT_GRID_COLUMN_STATE, 'tags')
    expect(isColumnVisible(shown, 'tags')).toBe(true)
    expect(isDefaultColumnState(shown)).toBe(false)
    const hiddenAgain = toggleColumn(shown, 'tags')
    expect(isColumnVisible(hiddenAgain, 'tags')).toBe(false)
    expect(isDefaultColumnState(hiddenAgain)).toBe(true)
  })

  it('hideable でない列は変更しない', () => {
    expect(toggleColumn(DEFAULT_GRID_COLUMN_STATE, 'title')).toBe(
      DEFAULT_GRID_COLUMN_STATE,
    )
  })
})

describe('setColumnWidth / columnWidth', () => {
  it('幅を変更でき、下限・上限にクランプされる', () => {
    const wide = setColumnWidth(DEFAULT_GRID_COLUMN_STATE, 'title', 300)
    expect(columnWidth(wide, 'title')).toBe(300)
    const tooNarrow = setColumnWidth(DEFAULT_GRID_COLUMN_STATE, 'title', 1)
    expect(columnWidth(tooNarrow, 'title')).toBe(96)
    const tooWide = setColumnWidth(DEFAULT_GRID_COLUMN_STATE, 'title', 99999)
    expect(columnWidth(tooWide, 'title')).toBe(GRID_COLUMN_MAX_WIDTH)
  })

  it('既定幅に戻すと widths からキーが消え、既定状態に戻る', () => {
    const changed = setColumnWidth(DEFAULT_GRID_COLUMN_STATE, 'start', 200)
    expect(isDefaultColumnState(changed)).toBe(false)
    const restored = setColumnWidth(changed, 'start', 128)
    expect(restored.widths).toEqual({})
    expect(isDefaultColumnState(restored)).toBe(true)
  })
})

describe('totalColumnsWidth / gridTemplate', () => {
  it('合計幅は表示中の列だけを数える', () => {
    const base = totalColumnsWidth(DEFAULT_GRID_COLUMN_STATE)
    const withTags = totalColumnsWidth(
      toggleColumn(DEFAULT_GRID_COLUMN_STATE, 'tags'),
    )
    expect(withTags).toBe(base + 88)
  })

  it('テンプレートは固定幅の列 + 末尾のフィラー列になる', () => {
    const state = setColumnWidth(DEFAULT_GRID_COLUMN_STATE, 'title', 240)
    const template = gridTemplate(state)
    expect(template.startsWith('240px ')).toBe(true)
    expect(template.endsWith(' minmax(0, 1fr)')).toBe(true)
    // タグ非表示なので列数は 6(+フィラー)
    expect(template.split(' ')).toHaveLength(8) // 6 列 + minmax(0, + 1fr)
  })
})

describe('parseStoredGridColumnState', () => {
  it('未保存・壊れた JSON・オブジェクト以外は既定状態に落とす', () => {
    expect(parseStoredGridColumnState(null)).toEqual(DEFAULT_GRID_COLUMN_STATE)
    expect(parseStoredGridColumnState('{oops')).toEqual(
      DEFAULT_GRID_COLUMN_STATE,
    )
    expect(parseStoredGridColumnState('"text"')).toEqual(
      DEFAULT_GRID_COLUMN_STATE,
    )
  })

  it('保存された表示状態・幅を復元する(空の hidden は全列表示)', () => {
    const parsed = parseStoredGridColumnState(
      JSON.stringify({ hidden: [], widths: { title: 300 } }),
    )
    expect(parsed.hidden).toEqual([])
    expect(columnWidth(parsed, 'title')).toBe(300)
  })

  it('不正な hidden・widths は検証して落とす', () => {
    const parsed = parseStoredGridColumnState(
      JSON.stringify({
        hidden: ['tags', 'title', 'unknown', 'tags', 42],
        widths: { title: 'wide', unknown: 100, start: 5, estimate: 56 },
      }),
    )
    // hideable でない title・未知キー・重複・非文字列は除外される
    expect(parsed.hidden).toEqual(['tags'])
    // 文字列幅・未知キーは無視、範囲外はクランプ、既定幅と同値は持たない
    expect(columnWidth(parsed, 'title')).toBe(155)
    expect(columnWidth(parsed, 'start')).toBe(88)
    expect(parsed.widths.estimate).toBeUndefined()
  })

  it('hidden が無い場合は既定(タグのみ非表示)に落とす', () => {
    const parsed = parseStoredGridColumnState(JSON.stringify({ widths: {} }))
    expect(parsed.hidden).toEqual(['tags'])
  })
})
