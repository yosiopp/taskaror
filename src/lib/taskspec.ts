import { parse, stringify } from 'yaml'
import type { Task, TaskSpec } from '../types/taskspec'
import { TASKSPEC_VERSION } from '../types/taskspec'

export class TaskSpecError extends Error {}

/**
 * YAML 文字列を TaskSpec として読み込む。
 * ここでは最低限の構造チェックのみ行う。schema/1.0/taskspec.schema.json に
 * よる完全なバリデーションはバリデーター実装時に追加する。
 */
export function parseTaskSpec(source: string): TaskSpec {
  const data: unknown = parse(source)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TaskSpecError(
      'TaskSpec のルートはオブジェクトである必要があります',
    )
  }
  const spec = data as Partial<TaskSpec>
  if (spec.taskspec !== TASKSPEC_VERSION) {
    throw new TaskSpecError(
      `未対応の taskspec バージョンです: ${String(spec.taskspec)}`,
    )
  }
  if (!Array.isArray(spec.tasks)) {
    throw new TaskSpecError('tasks は配列である必要があります')
  }
  return spec as TaskSpec
}

export function serializeTaskSpec(spec: TaskSpec): string {
  return stringify(spec)
}

export interface FlatTask {
  task: Task
  depth: number
}

/** タスク階層を深さ付きで平坦化する(ガント行の描画などに使う) */
export function flattenTasks(tasks: Task[], depth = 0): FlatTask[] {
  return tasks.flatMap((task) => [
    { task, depth },
    ...flattenTasks(task.tasks ?? [], depth + 1),
  ])
}
