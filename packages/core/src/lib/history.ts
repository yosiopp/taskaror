/**
 * 汎用の undo / redo 履歴ラッパ(React / DOM 非依存の純粋 TypeScript)。
 * 任意の reducer を包み、past / present / future を持つ高階 reducer にする。
 * UI 側はこの present を従来の状態として扱い、undo / redo アクションを dispatch する。
 */

/** 履歴つき状態。present が現在値、past は過去、future は redo 用の未来 */
export interface HistoryState<S, A> {
  /** 過去の状態(古い順)。undo で末尾から present に戻す */
  past: S[]
  /** 現在の状態 */
  present: S
  /** redo 用の未来の状態(新しい編集で破棄される) */
  future: S[]
  /**
   * 直前に present を生成したアクション(coalesce 判定に使う)。
   * 初期状態・undo / redo の直後は undefined(直後の編集はまとめ対象にしない)。
   */
  lastAction: A | undefined
}

/**
 * 履歴 reducer が受け取るアクション。通常のアクション A に加えて、
 * undo / redo の内部アクションを扱う。
 * 注意: A 側の type に 'undo' / 'redo' を使うとここで衝突する。
 */
export type HistoryAction<A> = A | { type: 'undo' } | { type: 'redo' }

export type HistoryReducer<S, A> = (
  state: HistoryState<S, A>,
  action: HistoryAction<A>,
) => HistoryState<S, A>

export interface HistoryOptions<A> {
  /** past に残す最大件数。超えたら古いものから捨てる(既定 100) */
  limit?: number
  /**
   * 直前のアクションと今回のアクションが「連続した 1 まとまりの編集」なら true を返す。
   * true のとき past を積まず present だけ差し替える(まとめて 1 回で undo できる)。
   * 例: setInfoTitle はキーストロークごとに飛ぶので直前も setInfoTitle ならまとめる。
   */
  shouldCoalesce?: (prevAction: A, nextAction: A) => boolean
}

/** past に残す既定の最大件数 */
const DEFAULT_LIMIT = 100

/** 初期の履歴状態を作る(present のみ。past / future は空) */
export function initHistory<S, A>(present: S): HistoryState<S, A> {
  return { past: [], present, future: [], lastAction: undefined }
}

export function canUndo<S, A>(state: HistoryState<S, A>): boolean {
  return state.past.length > 0
}

export function canRedo<S, A>(state: HistoryState<S, A>): boolean {
  return state.future.length > 0
}

/**
 * reducer を履歴対応にラップして高階 reducer を返す。
 * - 通常アクションは reducer を適用し、変化があれば past に積んで future を破棄する。
 * - 変化なし(present と同一参照)のアクションは履歴に積まない。
 * - shouldCoalesce が true のアクションは past に積まず present だけ差し替える。
 * - past が limit を超えたら古いものから捨てる。
 */
export function withHistory<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S,
  options: HistoryOptions<A> = {},
): HistoryReducer<S, A> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const shouldCoalesce = options.shouldCoalesce

  return function historyReducer(state, action) {
    if (action.type === 'undo') {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastAction: undefined,
      }
    }

    if (action.type === 'redo') {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        lastAction: undefined,
      }
    }

    // 通常アクション。undo / redo を除いた A として扱う。
    const editAction = action as A
    const nextPresent = reducer(state.present, editAction)

    // 変化なしは履歴に積まない(reducer が同一参照を返したとき)
    if (nextPresent === state.present) return state

    // 連続した編集はまとめる(past を積まず present だけ差し替える)
    if (
      state.lastAction !== undefined &&
      shouldCoalesce?.(state.lastAction, editAction)
    ) {
      return {
        past: state.past,
        present: nextPresent,
        future: [],
        lastAction: editAction,
      }
    }

    // 直前の present を past に積む。上限超過分は古いものから捨てる。
    const past = [...state.past, state.present]
    if (past.length > limit) past.splice(0, past.length - limit)
    return {
      past,
      present: nextPresent,
      future: [],
      lastAction: editAction,
    }
  }
}
