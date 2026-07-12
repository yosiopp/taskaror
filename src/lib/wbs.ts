/**
 * WBS 番号の導出(純粋関数・ブラウザ/React 非依存)。
 * WBS 番号(1, 1.1, 1.2, 2, 2.1 …)は保存せず、タスク階層から常に導出する
 * (Single Source of Truth)。並び順は YAML のネスト順(表示順)に一致する。
 */
import type { Task } from '../types/taskspec'

export interface WbsRow {
  task: Task
  /** WBS 番号(例: "1", "1.2", "2.3.1") */
  wbs: string
  /** ルート = 0 */
  depth: number
}

/**
 * タスク階層を表示順(深さ優先・親→子)に平坦化し、各タスクへ WBS 番号を振る。
 * 番号は各階層で 1 始まりの連番をドットで連結する(親 "1.2" の子は "1.2.1"…)。
 * 空配列は空を返す。
 */
export function computeWbs(tasks: Task[], prefix = '', depth = 0): WbsRow[] {
  return tasks.flatMap((task, index) => {
    const number = String(index + 1)
    const wbs = prefix === '' ? number : `${prefix}.${number}`
    return [
      { task, wbs, depth },
      ...computeWbs(task.tasks ?? [], wbs, depth + 1),
    ]
  })
}
