/**
 * スケジュール導出ロジック。TaskSpec ツリーから各タスクの開始日・終了日を計算する。
 * 導出値(開始日・終了日など)は保存せず、常にここで計算する(Single Source of Truth)。
 *
 * 規則(tasks.md の決めごと・実装定義に準拠):
 * - 期間(営業日)= ceil(工数時間 / 8h)。estimate 未指定は 0d のマイルストーン
 * - 開始日が土日なら翌営業日にずらす
 * - depends を持つタスクは先行タスクの終了日の翌営業日から開始。
 *   ただし先行が 0d(マイルストーン)なら同日から開始する
 * - start が明示されたタスクはその日から開始する
 * - start も depends もないタスクはプロジェクト最早 start(なければ今日)から開始する
 * - 親タスクの期間は子の包絡(最早開始〜最遅終了)。親の estimate は使わない
 * - 親の start・depends は子孫の開始下限として伝播する。子の明示 start はそれより優先する
 */
import type { Task, TaskSpec } from '../types/taskspec'
import { estimateToBusinessDays } from './estimate'
import {
  addBusinessDays,
  adjustToBusinessDay,
  businessDayEnd,
  businessDaysBetween,
  formatDate,
  maxDate,
  minDate,
  parseDate,
  today,
} from './date'

export interface ScheduledTask {
  task: Task
  /** 開始日(YYYY-MM-DD) */
  start: string
  /** 終了日(YYYY-MM-DD) */
  end: string
  /** 期間(営業日数)。マイルストーンは 0 */
  durationDays: number
  /** estimate 未指定(子なし)の 0d タスク */
  isMilestone: boolean
  /** 子を持つサマリータスク */
  isSummary: boolean
  children: ScheduledTask[]
}

export interface ScheduleOptions {
  /** 「今日」の基準日。省略時はローカルの今日。テスト用に注入できる */
  today?: Date | string
}

/** タスクの開始下限の内訳(lint などの分析用)。日付はいずれも YYYY-MM-DD */
export interface TaskStartFloor {
  /** 祖先(親の start・depends)から伝播する開始下限 */
  inherited: string
  /** 自タスクの depends から導かれる開始下限。最も遅い先行とその successorStart */
  depends?: { date: string; predecessorId: string }
}

/** スケジュール解決の内部機構。scheduleTasks と computeStartFloors で共有する */
function createResolver(spec: TaskSpec, options: ScheduleOptions) {
  const todayDate = resolveToday(options.today)

  const taskById = new Map<string, Task>()
  const parentOf = new Map<Task, Task | undefined>()
  const indexTasks = (tasks: Task[], parent?: Task): void => {
    for (const task of tasks) {
      taskById.set(task.id, task)
      parentOf.set(task, parent)
      if (task.tasks) indexTasks(task.tasks, task)
    }
  }
  indexTasks(spec.tasks)

  const projectEarliest = adjustToBusinessDay(
    findEarliestStart(spec.tasks) ?? todayDate,
  )

  const hasChildren = (task: Task): boolean => (task.tasks?.length ?? 0) > 0
  const durationDaysOf = (task: Task): number =>
    estimateToBusinessDays(task.estimate)
  const isMilestone = (task: Task): boolean =>
    !hasChildren(task) && durationDaysOf(task) === 0

  const startMemo = new Map<Task, Date>()
  const endMemo = new Map<Task, Date>()
  const resolving = new Set<Task>()

  // このタスクの開始下限(自身と祖先の start・depends から導く)。
  // 明示 start は祖先の下限より優先する。
  const effectiveFloor = (task: Task): Date => {
    if (task.start) return adjustToBusinessDay(parseDate(task.start))
    const inherited = inheritedFloor(task)
    const latest = latestDepends(task)
    return latest ? maxDate(inherited, latest.date) : inherited
  }

  const inheritedFloor = (task: Task): Date => {
    const parent = parentOf.get(task)
    return parent ? effectiveFloor(parent) : projectEarliest
  }

  // 先行タスクの後に続くタスクの開始候補日。
  const successorStart = (pred: Task): Date => {
    const end = resolveEnd(pred)
    return isMilestone(pred) ? end : addBusinessDays(end, 1)
  }

  // 自タスクの depends から導かれる開始下限(最も遅い先行とその successorStart)。
  // 同日の先行が複数あるときは depends で先に現れたものを採用する。
  // depends が無い・すべて参照切れなら undefined
  const latestDepends = (
    task: Task,
  ): { date: Date; predecessorId: string } | undefined => {
    let latest: { date: Date; predecessorId: string } | undefined
    for (const depId of task.depends ?? []) {
      const pred = taskById.get(depId)
      if (pred === undefined) continue // 参照切れは validateStructure 側で報告する
      const date = successorStart(pred)
      if (latest === undefined || date.getTime() > latest.date.getTime()) {
        latest = { date, predecessorId: depId }
      }
    }
    return latest
  }

  const resolveStart = (task: Task): Date => {
    const cached = startMemo.get(task)
    if (cached) return cached
    if (resolving.has(task)) return projectEarliest // 異常な循環参照のフォールバック
    resolving.add(task)
    const start = hasChildren(task)
      ? task.tasks!.map(resolveStart).reduce(minDate)
      : adjustToBusinessDay(effectiveFloor(task))
    resolving.delete(task)
    startMemo.set(task, start)
    return start
  }

  const resolveEnd = (task: Task): Date => {
    const cached = endMemo.get(task)
    if (cached) return cached
    const end = hasChildren(task)
      ? task.tasks!.map(resolveEnd).reduce(maxDate)
      : businessDayEnd(resolveStart(task), durationDaysOf(task))
    endMemo.set(task, end)
    return end
  }

  return {
    taskById,
    hasChildren,
    isMilestone,
    inheritedFloor,
    latestDepends,
    resolveStart,
    resolveEnd,
  }
}

export function scheduleTasks(
  spec: TaskSpec,
  options: ScheduleOptions = {},
): ScheduledTask[] {
  const resolver = createResolver(spec, options)
  const { hasChildren, isMilestone, resolveStart, resolveEnd } = resolver

  const build = (task: Task): ScheduledTask => {
    const start = resolveStart(task)
    const end = resolveEnd(task)
    const milestone = isMilestone(task)
    return {
      task,
      start: formatDate(start),
      end: formatDate(end),
      durationDays: milestone ? 0 : businessDaysBetween(start, end),
      isMilestone: milestone,
      isSummary: hasChildren(task),
      children: hasChildren(task) ? task.tasks!.map(build) : [],
    }
  }

  return spec.tasks.map(build)
}

/**
 * 各タスクの開始下限(祖先由来・depends 由来)を計算する。
 * scheduleTasks と同じ伝播ロジック(createResolver)を共有しており、
 * lint が明示 start との矛盾検出(docs/lint.md)に使う。キーはタスクオブジェクト。
 */
export function computeStartFloors(
  spec: TaskSpec,
  options: ScheduleOptions = {},
): Map<Task, TaskStartFloor> {
  const resolver = createResolver(spec, options)
  const floors = new Map<Task, TaskStartFloor>()
  const walk = (tasks: Task[]): void => {
    for (const task of tasks) {
      const latest = resolver.latestDepends(task)
      floors.set(task, {
        inherited: formatDate(resolver.inheritedFloor(task)),
        depends: latest && {
          date: formatDate(latest.date),
          predecessorId: latest.predecessorId,
        },
      })
      if (task.tasks) walk(task.tasks)
    }
  }
  walk(spec.tasks)
  return floors
}

function resolveToday(value: ScheduleOptions['today']): Date {
  if (value === undefined) return today()
  return typeof value === 'string' ? parseDate(value) : value
}

/** プロジェクト内で最も早い明示 start(営業日補正済み)。1 つもなければ undefined */
function findEarliestStart(tasks: Task[]): Date | undefined {
  let earliest: Date | undefined
  const walk = (list: Task[]): void => {
    for (const task of list) {
      if (task.start) {
        const date = adjustToBusinessDay(parseDate(task.start))
        earliest = earliest ? minDate(earliest, date) : date
      }
      if (task.tasks) walk(task.tasks)
    }
  }
  walk(tasks)
  return earliest
}
