import { isMap, parse, stringify } from 'yaml'
import type { Document } from 'yaml'
import type { Task, TaskSpec } from '../types/taskspec'
import { TASKSPEC_VERSION } from '../types/taskspec'
import { reconcileDocument } from './fidelity'

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

/**
 * TaskSpec を YAML 文字列へシリアライズする。
 *
 * baseDoc を渡すと、そのクローンに spec を差分適用(reconcile)して stringify し、
 * 未変更部分のコメント・キー順・引用符スタイルを保つ(読み込んだ YAML の忠実性)。
 * baseDoc が無い(新規/空)場合やルートがマップでない場合は、従来どおり plain stringify
 * にフォールバックする(後方互換)。
 */
export function serializeTaskSpec(
  spec: TaskSpec,
  baseDoc?: Document | null,
): string {
  if (!baseDoc || !isMap(baseDoc.contents)) return stringify(spec)
  const doc = baseDoc.clone()
  reconcileDocument(doc, spec)
  return doc.toString()
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

/** タスク階層の 1 ノード(YAML ドキュメント上の位置・祖先 id 付き) */
export interface TaskNode {
  task: Task
  /** YAML ドキュメント上の位置(例: tasks[0].tasks[1]) */
  path: string
  /** ルートから親までの祖先タスクの id */
  ancestorIds: ReadonlySet<string>
}

/**
 * タスク階層を文書順(pre-order)で位置パス・祖先 id 付きで平坦化する。
 * validate / lint が指摘の位置表示(tasks[i].tasks[j])に使う。
 */
export function collectTaskNodes(
  tasks: Task[],
  base = 'tasks',
  ancestorIds: ReadonlySet<string> = new Set(),
): TaskNode[] {
  return tasks.flatMap((task, index) => {
    const path = `${base}[${index}]`
    const children = task.tasks?.length
      ? collectTaskNodes(
          task.tasks,
          `${path}.tasks`,
          new Set([...ancestorIds, task.id]),
        )
      : []
    return [{ task, path, ancestorIds }, ...children]
  })
}
