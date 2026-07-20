/**
 * 左タスクグリッドのカラム構成(表示/非表示・幅)の純粋ロジック。
 * DOM / React には依存しないので単体テストできる。localStorage の読み書きなど
 * ブラウザ依存の処理は呼び出し側(storage.ts / App)が持つ。
 */

/** グリッドのカラム識別子(表示順) */
export type GridColumnKey =
  | 'title'
  | 'estimate'
  | 'start'
  | 'assignees'
  | 'tags'
  | 'progress'
  | 'depends'
  | 'note'

export interface GridColumnDef {
  key: GridColumnKey
  /** 列見出しのラベル */
  label: string
  /** 既定の幅(px) */
  defaultWidth: number
  /** ドラッグで縮められる下限(px) */
  minWidth: number
  /** メニューから非表示にできる列か */
  hideable: boolean
}

/** ドラッグで広げられる上限(px)。全列共通 */
export const GRID_COLUMN_MAX_WIDTH = 800

/**
 * 全カラムの定義(表示順)。既定幅の合計は、既定のグリッド幅
 * (GRID_WIDTH 560px から境界線 1px を除いた 559px)にタグ非表示時に一致させている。
 */
export const GRID_COLUMN_DEFS: readonly GridColumnDef[] = [
  {
    key: 'title',
    label: 'タスク名',
    defaultWidth: 155,
    minWidth: 96,
    hideable: false,
  },
  {
    key: 'estimate',
    label: '見積',
    defaultWidth: 56,
    minWidth: 40,
    hideable: false,
  },
  {
    key: 'start',
    label: '開始',
    defaultWidth: 128,
    minWidth: 88,
    hideable: false,
  },
  {
    key: 'assignees',
    label: '担当',
    defaultWidth: 88,
    minWidth: 48,
    hideable: true,
  },
  {
    key: 'tags',
    label: 'タグ',
    defaultWidth: 88,
    minWidth: 48,
    hideable: true,
  },
  {
    key: 'progress',
    label: '進捗',
    defaultWidth: 56,
    minWidth: 40,
    hideable: true,
  },
  {
    key: 'depends',
    label: '依存',
    defaultWidth: 76,
    minWidth: 40,
    hideable: false,
  },
  {
    key: 'note',
    label: 'メモ',
    defaultWidth: 160,
    minWidth: 64,
    hideable: true,
  },
]

/** カラムの表示状態と幅(localStorage に保存するビュー設定) */
export interface GridColumnState {
  /** 非表示にしているカラム(hideable な列のみ入りうる) */
  hidden: GridColumnKey[]
  /** ドラッグで変更した幅(px)。キーが無い列は既定幅 */
  widths: Partial<Record<GridColumnKey, number>>
}

/** 既定状態: タグ列・メモ列が非表示、幅はすべて既定 */
export const DEFAULT_GRID_COLUMN_STATE: GridColumnState = {
  hidden: ['tags', 'note'],
  widths: {},
}

/**
 * 保存形式のバージョン。カラムを追加したら上げる。
 * 旧バージョンの保存データでは新カラムの表示/非表示を選べていないため、
 * 復元時に新カラム(note)を非表示側へ補い、突然列が現れないようにする。
 */
export const GRID_COLUMN_STATE_VERSION = 2

function defOf(key: GridColumnKey): GridColumnDef {
  // GRID_COLUMN_DEFS は全 GridColumnKey を網羅している(テストで保証)
  return GRID_COLUMN_DEFS.find((def) => def.key === key) as GridColumnDef
}

/** その列がいま表示されているか */
export function isColumnVisible(
  state: GridColumnState,
  key: GridColumnKey,
): boolean {
  return !state.hidden.includes(key)
}

/** 表示中のカラム定義を表示順で返す */
export function visibleColumnDefs(state: GridColumnState): GridColumnDef[] {
  return GRID_COLUMN_DEFS.filter((def) => isColumnVisible(state, def.key))
}

/** 列幅を [minWidth, GRID_COLUMN_MAX_WIDTH] に丸め込む。NaN 等は既定幅に落とす */
export function clampColumnWidth(key: GridColumnKey, width: number): number {
  const def = defOf(key)
  if (!Number.isFinite(width)) return def.defaultWidth
  return Math.min(
    Math.max(Math.round(width), def.minWidth),
    GRID_COLUMN_MAX_WIDTH,
  )
}

/** その列の現在幅(px)。変更されていなければ既定幅 */
export function columnWidth(
  state: GridColumnState,
  key: GridColumnKey,
): number {
  const stored = state.widths[key]
  return stored === undefined
    ? defOf(key).defaultWidth
    : clampColumnWidth(key, stored)
}

/** 表示中の全カラムの幅の合計(px)。横スクロールの要否判定に使う */
export function totalColumnsWidth(state: GridColumnState): number {
  return visibleColumnDefs(state).reduce(
    (sum, def) => sum + columnWidth(state, def.key),
    0,
  )
}

/**
 * grid-template-columns の値を作る。表示列は固定幅、末尾にペイン余白を
 * 埋めるフィラー列 minmax(0, 1fr) を足す(全列が収まるときの右側の空き用)。
 */
export function gridTemplate(state: GridColumnState): string {
  const cols = visibleColumnDefs(state).map(
    (def) => `${columnWidth(state, def.key)}px`,
  )
  return `${cols.join(' ')} minmax(0, 1fr)`
}

/**
 * 列幅を変更した新しい状態を返す(不変更新)。
 * 既定幅と同じ値になったら widths からキーを消し、既定状態の判定を保つ。
 */
export function setColumnWidth(
  state: GridColumnState,
  key: GridColumnKey,
  width: number,
): GridColumnState {
  const next = clampColumnWidth(key, width)
  const widths = { ...state.widths }
  if (next === defOf(key).defaultWidth) delete widths[key]
  else widths[key] = next
  return { ...state, widths }
}

/** 列の表示/非表示を切り替えた新しい状態を返す。hideable でない列は変えない */
export function toggleColumn(
  state: GridColumnState,
  key: GridColumnKey,
): GridColumnState {
  if (!defOf(key).hideable) return state
  const hidden = state.hidden.includes(key)
    ? state.hidden.filter((k) => k !== key)
    : [...state.hidden, key]
  return { ...state, hidden }
}

/** 既定状態(タグのみ非表示・幅変更なし)か。リセット項目の無効化判定に使う */
export function isDefaultColumnState(state: GridColumnState): boolean {
  const hidden = new Set(state.hidden)
  const defaults = new Set(DEFAULT_GRID_COLUMN_STATE.hidden)
  return (
    hidden.size === defaults.size &&
    [...defaults].every((key) => hidden.has(key)) &&
    Object.keys(state.widths).length === 0
  )
}

/** hideable な GridColumnKey か(localStorage 由来の値の検証に使う) */
function isHideableKey(value: unknown): value is GridColumnKey {
  return GRID_COLUMN_DEFS.some((def) => def.key === value && def.hideable)
}

/** カラム状態を localStorage 保存用の JSON 文字列にする(バージョン付き) */
export function serializeGridColumnState(state: GridColumnState): string {
  return JSON.stringify({ v: GRID_COLUMN_STATE_VERSION, ...state })
}

/**
 * localStorage から読んだ生文字列を検証してカラム状態に変換する。
 * 未保存・壊れている場合は既定状態。hidden は hideable な列だけを残し、
 * widths は既知の列の有限数値だけをクランプして取り込む。
 * バージョンが古い保存データでは、当時存在しなかった note 列を非表示側へ補う。
 */
export function parseStoredGridColumnState(
  raw: string | null,
): GridColumnState {
  if (raw === null) return DEFAULT_GRID_COLUMN_STATE
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_GRID_COLUMN_STATE
  }
  if (typeof data !== 'object' || data === null) {
    return DEFAULT_GRID_COLUMN_STATE
  }
  const record = data as Record<string, unknown>

  const hidden = Array.isArray(record.hidden)
    ? [...new Set(record.hidden.filter(isHideableKey))]
    : [...DEFAULT_GRID_COLUMN_STATE.hidden]

  const legacy =
    typeof record.v !== 'number' || record.v < GRID_COLUMN_STATE_VERSION
  if (legacy && !hidden.includes('note')) hidden.push('note')

  const widths: Partial<Record<GridColumnKey, number>> = {}
  if (typeof record.widths === 'object' && record.widths !== null) {
    for (const def of GRID_COLUMN_DEFS) {
      const value = (record.widths as Record<string, unknown>)[def.key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const clamped = clampColumnWidth(def.key, value)
      if (clamped !== def.defaultWidth) widths[def.key] = clamped
    }
  }
  return { hidden, widths }
}
