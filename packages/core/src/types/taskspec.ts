/**
 * TaskSpec 1.0 の型定義。schema/1.0/taskspec.schema.json と対応する。
 */

export const TASKSPEC_VERSION = '1.0'

export interface TaskSpec {
  taskspec: typeof TASKSPEC_VERSION
  info?: TaskSpecInfo
  tasks: Task[]
}

export interface TaskSpecInfo {
  title?: string
}

export interface Task {
  /** ^[A-Za-z][A-Za-z0-9._-]*$ */
  id: string
  title: string
  /** 見積工数。経過時間ではなく工数を表す(例: "1.5d", "4h") */
  estimate?: string
  /** 開始予定日(YYYY-MM-DD) */
  start?: string
  /** 先行タスクの id */
  depends?: string[]
  assignees?: string[]
  /** 進捗率(0〜100) */
  progress?: number
  tags?: string[]
  /** Markdown のメモ */
  note?: string
  /** 子タスク */
  tasks?: Task[]
  /** x- プレフィックスによる独自拡張 */
  [extension: `x-${string}`]: unknown
}
