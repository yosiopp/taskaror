/**
 * lint(助言・矛盾検出)ロジック。schema・構造としては valid な TaskSpec を対象に、
 * スケジュール導出の意味論(docs/derivation.md)から見て矛盾している・怪しい記述を検出する。
 * ルールの仕様は docs/lint.md にまとめている(実装と同期させること)。
 *
 * 前提: validateTaskSpec を通過した spec を渡すこと。
 * 構造が壊れた spec(依存の循環など)では検出結果を保証しない。
 * すべてのルールは明示された入力(start・estimate・depends・progress)にのみ
 * 反応するため、結果は実行日に依存しない。
 */
import type { Task, TaskSpec } from '../types/taskspec'
import {
  computeStartFloors,
  type ScheduleOptions,
  type TaskStartFloor,
} from './schedule'
import { collectTaskNodes } from './taskspec'
import type { TaskNode } from './taskspec'
import { adjustToBusinessDay, formatDate, isWeekend, parseDate } from './date'

export type LintSeverity = 'warning' | 'info'

/** lint で見つかった 1 件の指摘 */
export interface LintIssue {
  /** ルール ID(docs/lint.md 参照) */
  rule: string
  severity: LintSeverity
  /** YAML ドキュメント上の位置(例: tasks[0].tasks[1]) */
  path: string
  /** 対象タスクの id */
  taskId: string
  /** 日本語の説明 */
  message: string
}

/** lint 対象のタスク 1 件(位置と祖先 id 付き)。taskspec.ts の TaskNode を共用する */
type LintNode = TaskNode

/**
 * TaskSpec を lint し、指摘を文書順(タスク順 → ルール順)で返す。
 * options.today は schedule と同じ基準日の注入用(結果は通常、実行日に依存しない)。
 */
export function lintTaskSpec(
  spec: TaskSpec,
  options: ScheduleOptions = {},
): LintIssue[] {
  const nodes = collectTaskNodes(spec.tasks)
  const nodeById = new Map(nodes.map((node) => [node.task.id, node]))
  const floors = computeStartFloors(spec, options)

  const issues: LintIssue[] = []
  for (const node of nodes) {
    checkParentEstimate(node, issues)
    checkStartBeforeParent(node, floors, issues)
    checkStartBeforeDepends(node, floors, issues)
    checkHierarchyDepends(node, nodeById, issues)
    checkCompletedBeforePredecessor(node, nodeById, issues)
    checkWeekendStart(node, issues)
  }
  return issues
}

function push(
  issues: LintIssue[],
  node: LintNode,
  rule: string,
  severity: LintSeverity,
  message: string,
): void {
  issues.push({
    rule,
    severity,
    path: node.path,
    taskId: node.task.id,
    message,
  })
}

/** parent-estimate: 子を持つタスクの estimate は導出に使われない */
function checkParentEstimate(node: LintNode, issues: LintIssue[]): void {
  const { task } = node
  if ((task.tasks?.length ?? 0) === 0 || task.estimate === undefined) return
  push(
    issues,
    node,
    'parent-estimate',
    'warning',
    `子を持つタスクの estimate("${task.estimate}")はスケジュール導出に使われません(親の期間は子の包絡で決まります)`,
  )
}

/** start-before-parent: 明示 start が祖先から伝播する開始下限より前 */
function checkStartBeforeParent(
  node: LintNode,
  floors: Map<Task, TaskStartFloor>,
  issues: LintIssue[],
): void {
  const { task } = node
  if (task.start === undefined) return
  const floor = floors.get(task)
  if (floor === undefined) return
  // 比較は調整後 start(土日は翌営業日)で行う。
  // ルートタスクの下限はプロジェクト最早 start のため、ここに来るのは祖先由来の下限のみ
  const adjusted = adjustToBusinessDay(parseDate(task.start))
  if (adjusted.getTime() >= parseDate(floor.inherited).getTime()) return
  push(
    issues,
    node,
    'start-before-parent',
    'warning',
    `明示 start(${task.start})が祖先から伝播する開始下限(${floor.inherited})より前です(導出では start が優先されます)`,
  )
}

/** start-before-depends: 明示 start が自タスクの depends から導かれる開始可能日より前 */
function checkStartBeforeDepends(
  node: LintNode,
  floors: Map<Task, TaskStartFloor>,
  issues: LintIssue[],
): void {
  const { task } = node
  if (task.start === undefined) return
  const depends = floors.get(task)?.depends
  if (depends === undefined) return
  const adjusted = adjustToBusinessDay(parseDate(task.start))
  if (adjusted.getTime() >= parseDate(depends.date).getTime()) return
  push(
    issues,
    node,
    'start-before-depends',
    'warning',
    `明示 start(${task.start})が先行タスク "${depends.predecessorId}" から導かれる開始可能日(${depends.date})より前です(導出では start が優先され、依存は満たされません)`,
  )
}

/** hierarchy-depends: depends が自分の祖先または子孫を指している */
function checkHierarchyDepends(
  node: LintNode,
  nodeById: Map<string, LintNode>,
  issues: LintIssue[],
): void {
  const { task } = node
  for (const depId of task.depends ?? []) {
    if (node.ancestorIds.has(depId)) {
      push(
        issues,
        node,
        'hierarchy-depends',
        'warning',
        `先行タスク "${depId}" は自分の祖先です(祖先の期間は自分を含むため、この依存は成立しません)`,
      )
    } else if (nodeById.get(depId)?.ancestorIds.has(task.id)) {
      push(
        issues,
        node,
        'hierarchy-depends',
        'warning',
        `先行タスク "${depId}" は自分の子孫です(自分の期間は子孫を含むため、この依存は成立しません)`,
      )
    }
  }
}

/** completed-before-predecessor: progress 100 のタスクの先行が未完了 */
function checkCompletedBeforePredecessor(
  node: LintNode,
  nodeById: Map<string, LintNode>,
  issues: LintIssue[],
): void {
  const { task } = node
  if (task.progress !== 100) return
  for (const depId of task.depends ?? []) {
    const pred = nodeById.get(depId)?.task
    if (pred === undefined) continue // 参照切れは validate の領分
    const unfinished = findUnfinished(pred)
    if (unfinished === undefined) continue
    const message =
      unfinished === pred
        ? `progress が 100 ですが、先行タスク "${depId}" は未完了です(progress: ${unfinished.progress})`
        : `progress が 100 ですが、先行タスク "${depId}" の子孫 "${unfinished.id}" が未完了です(progress: ${unfinished.progress})`
    push(issues, node, 'completed-before-predecessor', 'warning', message)
  }
}

/**
 * タスク自身または子孫のうち、progress が明示されていて 100 未満の最初のタスク。
 * progress 未指定は「進捗不明」として扱い、未完了とはみなさない(docs/lint.md)
 */
function findUnfinished(task: Task): Task | undefined {
  if (task.progress !== undefined && task.progress < 100) return task
  for (const child of task.tasks ?? []) {
    const found = findUnfinished(child)
    if (found !== undefined) return found
  }
  return undefined
}

/** weekend-start: 明示 start が土日(導出では翌営業日にずれる) */
function checkWeekendStart(node: LintNode, issues: LintIssue[]): void {
  const { task } = node
  if (task.start === undefined) return
  const date = parseDate(task.start)
  if (!isWeekend(date)) return
  const dayName = date.getUTCDay() === 6 ? '土曜日' : '日曜日'
  const adjusted = formatDate(adjustToBusinessDay(date))
  push(
    issues,
    node,
    'weekend-start',
    'info',
    `start(${task.start})は${dayName}のため、導出では翌営業日(${adjusted})から開始します`,
  )
}
