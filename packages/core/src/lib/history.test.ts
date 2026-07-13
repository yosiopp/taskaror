import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  initHistory,
  withHistory,
  type HistoryState,
} from './history'

// テスト用の単純な数値 reducer。
// - inc / add: 値を変える(必ず新しい値になる)
// - set: 同じ値なら同一参照(変化なし)を返す
// - noop: 常に変化なし(同一参照)
type CountAction =
  | { type: 'inc' }
  | { type: 'add'; by: number }
  | { type: 'set'; value: number }
  | { type: 'noop' }

function countReducer(state: number, action: CountAction): number {
  switch (action.type) {
    case 'inc':
      return state + 1
    case 'add':
      return state + action.by
    case 'set':
      return action.value === state ? state : action.value
    case 'noop':
      return state
  }
}

/** 一連のアクションを順に適用するヘルパー */
function run(
  reducer: ReturnType<typeof withHistory<number, CountAction>>,
  start: number,
  ...actions: Parameters<typeof reducer>[1][]
): HistoryState<number, CountAction> {
  return actions.reduce(reducer, initHistory<number, CountAction>(start))
}

describe('withHistory', () => {
  it('undo で直前の状態に戻り、redo でやり直せる', () => {
    const reducer = withHistory(countReducer)
    let state = run(reducer, 0, { type: 'inc' }, { type: 'inc' })
    expect(state.present).toBe(2)
    expect(state.past).toEqual([0, 1])

    state = reducer(state, { type: 'undo' })
    expect(state.present).toBe(1)
    expect(canRedo(state)).toBe(true)

    state = reducer(state, { type: 'redo' })
    expect(state.present).toBe(2)
    expect(canRedo(state)).toBe(false)
  })

  it('履歴がないときの undo / redo は同一参照を返す(何もしない)', () => {
    const reducer = withHistory(countReducer)
    const state = initHistory<number, CountAction>(0)
    expect(reducer(state, { type: 'undo' })).toBe(state)
    expect(reducer(state, { type: 'redo' })).toBe(state)
    expect(canUndo(state)).toBe(false)
    expect(canRedo(state)).toBe(false)
  })

  it('変化なし(同一参照)のアクションは履歴に積まない', () => {
    const reducer = withHistory(countReducer)
    let state = run(reducer, 5, { type: 'noop' })
    expect(state.past).toEqual([])
    // 値が変わらない set も積まない
    state = reducer(state, { type: 'set', value: 5 })
    expect(state.past).toEqual([])
    expect(canUndo(state)).toBe(false)
  })

  it('新しい編集で future(redo 候補)が破棄される', () => {
    const reducer = withHistory(countReducer)
    let state = run(reducer, 0, { type: 'inc' })
    state = reducer(state, { type: 'undo' })
    expect(canRedo(state)).toBe(true)
    state = reducer(state, { type: 'inc' })
    expect(canRedo(state)).toBe(false)
    expect(state.present).toBe(1)
  })

  it('past は上限を超えたら古いものから捨てる', () => {
    const reducer = withHistory(countReducer, { limit: 3 })
    let state = initHistory<number, CountAction>(0)
    for (let i = 0; i < 10; i += 1) {
      state = reducer(state, { type: 'inc' })
    }
    expect(state.present).toBe(10)
    expect(state.past).toEqual([7, 8, 9])
    // 上限までしか戻れない
    for (let i = 0; i < 3; i += 1) {
      state = reducer(state, { type: 'undo' })
    }
    expect(state.present).toBe(7)
    expect(canUndo(state)).toBe(false)
  })

  it('coalesce 対象の連続編集は 1 履歴にまとめる', () => {
    const reducer = withHistory(countReducer, {
      shouldCoalesce: (prev, next) =>
        prev.type === 'set' && next.type === 'set',
    })
    let state = run(
      reducer,
      0,
      { type: 'set', value: 1 },
      { type: 'set', value: 2 },
      { type: 'set', value: 3 },
    )
    expect(state.present).toBe(3)
    expect(state.past).toEqual([0])
    // まとめた分は 1 回の undo で最初まで戻る
    state = reducer(state, { type: 'undo' })
    expect(state.present).toBe(0)
  })

  it('種類の違うアクションを挟むと coalesce は途切れる', () => {
    const reducer = withHistory(countReducer, {
      shouldCoalesce: (prev, next) =>
        prev.type === 'set' && next.type === 'set',
    })
    const state = run(
      reducer,
      0,
      { type: 'set', value: 1 },
      { type: 'inc' },
      { type: 'set', value: 5 },
    )
    expect(state.present).toBe(5)
    expect(state.past).toEqual([0, 1, 2])
  })

  it('undo 直後の編集は直前の編集とまとめない', () => {
    const reducer = withHistory(countReducer, {
      shouldCoalesce: (prev, next) =>
        prev.type === 'set' && next.type === 'set',
    })
    let state = run(reducer, 0, { type: 'set', value: 1 })
    state = reducer(state, { type: 'undo' })
    state = reducer(state, { type: 'set', value: 2 })
    expect(state.present).toBe(2)
    expect(state.past).toEqual([0])
  })
})
