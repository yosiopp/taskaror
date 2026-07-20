/**
 * localStorage への永続化(ブラウザ専用)。
 * 編集内容(YAML テキスト)とビュー設定(ビューモード・グリッド幅・
 * クリティカルパス表示・ガントフィルタ)の読み書きをここに集約する。
 * どの関数も localStorage が使えない環境・失敗時には黙ってフォールバックする
 * (容量超過やプライベートモードでの失敗は無視する)。
 */
import type { ViewMode } from '../components/Toolbar'
import { GRID_WIDTH } from '../components/constants'
import { maxGridWidth, parseStoredGridWidth } from '../components/paneWidth'
import {
  parseStoredGridColumnState,
  serializeGridColumnState,
} from '../components/gridColumns'
import type { GridColumnState } from '../components/gridColumns'
import { serializeTaskSpec } from '@taskaror/core/taskspec'
import { parseTaskSpecDocument } from '@taskaror/core/fidelity'
import type { Document } from '@taskaror/core/fidelity'
import { validateTaskSpec } from '@taskaror/core/validate'
import { EMPTY_GANTT_FILTER } from '@taskaror/core/gantt'
import type { GanttFilter } from '@taskaror/core/gantt'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

/** localStorage の保存キー(旧: JSON 形式。後方互換のため読み込みのみ対応) */
const STORAGE_KEY = 'taskaror:spec'
/** localStorage の保存キー(新: YAML テキスト。コメント等の忠実性を保つ) */
const STORAGE_KEY_YAML = 'taskaror:spec.yaml'

/** localStorage から文字列を読む(失敗しても null を返す) */
function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** localStorage へ文字列を書く(失敗しても無視する) */
function writeStorage(key: string, value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, value)
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/**
 * localStorage から編集内容を復元する。
 * 新形式(YAML テキスト)を優先し、コメント等を保持したベース Document も復元する。
 * 旧形式(JSON)からは spec のみ移行する(忠実性のベースは持てないので doc は null)。
 * 未保存・壊れている・検証に通らない場合は null を返し、サンプルにフォールバックさせる。
 */
export function loadStoredSpec(): {
  spec: TaskSpec
  doc: Document | null
} | null {
  // 新形式: YAML テキスト(ベース Document も一緒に復元してコメント等を保つ)
  const yamlText = readStorage(STORAGE_KEY_YAML)
  if (yamlText !== null) {
    try {
      const parsed = parseTaskSpecDocument(yamlText)
      if (validateTaskSpec(parsed.spec).length === 0) return parsed
    } catch {
      // 壊れていれば旧形式・サンプルへフォールバックする
    }
  }
  // 旧形式: JSON(コメント等のベースは持てないので plain 扱い)
  const json = readStorage(STORAGE_KEY)
  if (json !== null) {
    try {
      const data: unknown = JSON.parse(json)
      if (validateTaskSpec(data).length === 0) {
        return { spec: data as TaskSpec, doc: null }
      }
    } catch {
      // ignore
    }
  }
  return null
}

/**
 * 編集内容を localStorage に YAML テキストで保存する。
 * baseDoc があれば忠実性を効かせて serialize するので、リロード後もコメント等が残る。
 */
export function saveStoredSpec(spec: TaskSpec, baseDoc: Document | null): void {
  writeStorage(STORAGE_KEY_YAML, serializeTaskSpec(spec, baseDoc))
}

/** ビューモードの保存キー */
const VIEW_MODE_KEY = 'taskaror:viewMode'

/** 妥当なビューモードか(localStorage 由来の値の検証に使う) */
function isViewMode(value: unknown): value is ViewMode {
  return value === 'gantt' || value === 'yaml' || value === 'wbs'
}

/** localStorage から保存済みのビューモードを復元する(未保存・不正なら 'gantt') */
export function loadViewMode(): ViewMode {
  const raw = readStorage(VIEW_MODE_KEY)
  return isViewMode(raw) ? raw : 'gantt'
}

/** ビューモードを localStorage に保存する */
export function saveViewMode(mode: ViewMode): void {
  writeStorage(VIEW_MODE_KEY, mode)
}

/** グリッド幅の保存キー */
const GRID_WIDTH_KEY = 'taskaror:gridWidth'

/**
 * localStorage から保存済みのグリッド幅を復元する。
 * 未保存・壊れている・範囲外なら既定幅にフォールバックする。SSR では既定幅。
 */
export function loadStoredGridWidth(): number {
  if (typeof window === 'undefined') return GRID_WIDTH
  const max = maxGridWidth(window.innerWidth)
  return parseStoredGridWidth(readStorage(GRID_WIDTH_KEY), max, GRID_WIDTH)
}

/** グリッド幅を localStorage に保存する */
export function saveStoredGridWidth(width: number): void {
  writeStorage(GRID_WIDTH_KEY, String(Math.round(width)))
}

/** グリッドのカラム状態(表示/非表示・幅)の保存キー */
const GRID_COLUMNS_KEY = 'taskaror:gridColumns'

/** カラム状態を復元する(未保存・壊れている場合は既定状態) */
export function loadGridColumnState(): GridColumnState {
  return parseStoredGridColumnState(readStorage(GRID_COLUMNS_KEY))
}

/** カラム状態を localStorage に保存する(バージョン付き JSON) */
export function saveGridColumnState(state: GridColumnState): void {
  writeStorage(GRID_COLUMNS_KEY, serializeGridColumnState(state))
}

/** クリティカルパス表示の保存キー */
const CRITICAL_PATH_KEY = 'taskaror:criticalPath'

/** クリティカルパス表示の ON/OFF を復元する(未保存・不正なら OFF) */
export function loadShowCriticalPath(): boolean {
  return readStorage(CRITICAL_PATH_KEY) === '1'
}

/** クリティカルパス表示の ON/OFF を保存する */
export function saveShowCriticalPath(on: boolean): void {
  writeStorage(CRITICAL_PATH_KEY, on ? '1' : '0')
}

/** ガントフィルタの保存キー */
const GANTT_FILTER_KEY = 'taskaror:ganttFilter'
/** 完了タスク非表示の旧保存キー(フィルタ導入前。読み込みでの移行のみ対応) */
const HIDE_COMPLETED_KEY = 'taskaror:hideCompleted'

/** 文字列配列か(localStorage 由来の値の検証に使う) */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/** 妥当な GanttFilter か(localStorage 由来の値の検証に使う) */
function isGanttFilter(value: unknown): value is GanttFilter {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    isStringArray(record.assignees) &&
    isStringArray(record.tags) &&
    typeof record.hideCompleted === 'boolean'
  )
}

/**
 * ガントフィルタ(担当者・タグ・完了タスク非表示)を復元する。
 * 未保存・壊れている場合は旧形式(完了タスク非表示のみ)から移行し、
 * それもなければ空のフィルタを返す。
 */
export function loadGanttFilter(): GanttFilter {
  const raw = readStorage(GANTT_FILTER_KEY)
  if (raw !== null) {
    try {
      const data: unknown = JSON.parse(raw)
      if (isGanttFilter(data)) return data
    } catch {
      // 壊れていれば旧形式・既定値へフォールバックする
    }
  }
  return {
    ...EMPTY_GANTT_FILTER,
    hideCompleted: readStorage(HIDE_COMPLETED_KEY) === '1',
  }
}

/** ガントフィルタを localStorage に保存する */
export function saveGanttFilter(filter: GanttFilter): void {
  writeStorage(GANTT_FILTER_KEY, JSON.stringify(filter))
}
