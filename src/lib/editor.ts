/**
 * エディタの状態管理(TaskSpec ツリーへの編集操作)。
 * React 非依存の純粋関数として実装し、UI 側は useReducer から呼び出す。
 * すべての操作は不変更新で新しい TaskSpec を返す。
 */
import type { Task, TaskSpec } from '../types/taskspec'
import type { FlatTask } from './taskspec'

/** 編集可能なフィールド(導出値は含めない) */
export interface TaskFields {
  title: string
  estimate?: string
  start?: string
  depends?: string[]
  assignees?: string[]
  progress?: number
  tags?: string[]
  note?: string
}

export type AddMode = 'root-append' | 'child' | 'sibling-after'

/** ドラッグ&ドロップの落とし先。対象タスクの直前・直後(兄弟)/ 子として */
export type DropPosition = 'before' | 'after' | 'child'

export type EditorAction =
  | { type: 'addTask'; task: Task; mode: AddMode; targetId?: string }
  | { type: 'removeTask'; id: string }
  | { type: 'updateTask'; id: string; changes: Partial<TaskFields> }
  | { type: 'indentTask'; id: string }
  | { type: 'outdentTask'; id: string }
  | { type: 'moveTask'; id: string; direction: 'up' | 'down' }
  | {
      type: 'moveTaskTo'
      id: string
      targetId: string
      position: DropPosition
    }
  | { type: 'setInfoTitle'; title: string }
  | { type: 'replaceSpec'; spec: TaskSpec }

export function editorReducer(spec: TaskSpec, action: EditorAction): TaskSpec {
  switch (action.type) {
    case 'replaceSpec':
      // spec 全体を差し替える(新規作成・ファイル読み込み・localStorage 復元)
      return action.spec
    case 'addTask':
      return addTask(spec, action)
    case 'removeTask':
      return removeTask(spec, action.id)
    case 'updateTask':
      return withTasks(
        spec,
        mapTask(spec.tasks, action.id, (task) =>
          applyFieldChanges(task, action.changes),
        ),
      )
    case 'indentTask':
      return withTasks(spec, indentTask(spec.tasks, action.id))
    case 'outdentTask':
      return withTasks(spec, outdentTask(spec.tasks, action.id) ?? spec.tasks)
    case 'moveTask':
      return withTasks(spec, moveTask(spec.tasks, action.id, action.direction))
    case 'moveTaskTo':
      return withTasks(
        spec,
        moveTaskTo(spec.tasks, action.id, action.targetId, action.position),
      )
    case 'setInfoTitle':
      return setInfoTitle(spec, action.title)
  }
}

// --- id 採番 ---

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const ID_LENGTH = 4
const MAX_ID_ATTEMPTS = 1000

/** 全階層のタスク id を集める */
export function collectIds(tasks: Task[]): Set<string> {
  const ids = new Set<string>()
  const walk = (list: Task[]): void => {
    for (const task of list) {
      ids.add(task.id)
      if (task.tasks) walk(task.tasks)
    }
  }
  walk(tasks)
  return ids
}

/**
 * 未使用のタスク id を生成する(`t-` + 英数字 4 文字。例: `t-a3f9`)。
 * 衝突したら再生成する(決めごと参照)。
 */
export function generateTaskId(
  existing: Set<string>,
  random: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    let suffix = ''
    for (let i = 0; i < ID_LENGTH; i += 1) {
      suffix += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)]
    }
    const id = `t-${suffix}`
    if (!existing.has(id)) return id
  }
  throw new Error('タスク id の生成に失敗しました')
}

/** 新しい空タスクを作る(未使用 id を採番する) */
export function newTask(
  spec: TaskSpec,
  options: { id?: string; title?: string; random?: () => number } = {},
): Task {
  const id =
    options.id ?? generateTaskId(collectIds(spec.tasks), options.random)
  return { id, title: options.title ?? '新しいタスク' }
}

// --- 追加・削除 ---

function addTask(
  spec: TaskSpec,
  action: { task: Task; mode: AddMode; targetId?: string },
): TaskSpec {
  const { task, mode, targetId } = action
  if (mode === 'root-append') {
    return withTasks(spec, [...spec.tasks, task])
  }
  if (targetId === undefined) return spec
  if (mode === 'child') {
    return withTasks(
      spec,
      mapTask(spec.tasks, targetId, (parent) => ({
        ...parent,
        tasks: [...(parent.tasks ?? []), task],
      })),
    )
  }
  // sibling-after
  const next = transformSiblings(spec.tasks, targetId, (siblings, index) => {
    const copy = siblings.slice()
    copy.splice(index + 1, 0, task)
    return copy
  })
  return next ? withTasks(spec, next) : spec
}

function removeTask(spec: TaskSpec, id: string): TaskSpec {
  const target = findTask(spec.tasks, id)
  if (target === undefined) return spec
  const removedIds = collectIds([target])
  const withoutTask = transformSiblings(spec.tasks, id, (siblings, index) =>
    siblings.filter((_, i) => i !== index),
  )
  if (withoutTask === null) return spec
  return withTasks(spec, stripDependencies(withoutTask, removedIds))
}

// --- 階層変更・並び替え ---

/** 直前の兄弟の子にする。先頭要素(直前の兄弟なし)なら何もしない */
function indentTask(tasks: Task[], id: string): Task[] {
  return (
    transformSiblings(tasks, id, (siblings, index) => {
      if (index === 0) return siblings
      const task = siblings[index]
      const prev = siblings[index - 1]
      const copy = siblings.slice()
      copy[index - 1] = { ...prev, tasks: [...(prev.tasks ?? []), task] }
      copy.splice(index, 1)
      return copy
    }) ?? tasks
  )
}

/** 親の次の兄弟にする。ルート直下(親なし)なら null を返す */
function outdentTask(tasks: Task[], id: string): Task[] | null {
  // このレベルの各タスクが target を直接の子に持つか調べる
  for (let i = 0; i < tasks.length; i += 1) {
    const parent = tasks[i]
    const children = parent.tasks
    if (children === undefined) continue
    const childIndex = children.findIndex((child) => child.id === id)
    if (childIndex === -1) continue

    const child = children[childIndex]
    const remaining = children.filter((_, j) => j !== childIndex)
    const newParent: Task = { ...parent }
    if (remaining.length > 0) {
      newParent.tasks = remaining
    } else {
      delete newParent.tasks
    }
    const result = tasks.slice()
    result[i] = newParent
    result.splice(i + 1, 0, child)
    return result
  }

  // 見つからなければ子孫を再帰的に探索する
  let changed = false
  const next = tasks.map((task): Task => {
    if (!task.tasks) return task
    const childResult = outdentTask(task.tasks, id)
    if (childResult) {
      changed = true
      return { ...task, tasks: childResult }
    }
    return task
  })
  return changed ? next : null
}

/** 同じ親の中で上下に入れ替える */
function moveTask(tasks: Task[], id: string, direction: 'up' | 'down'): Task[] {
  return (
    transformSiblings(tasks, id, (siblings, index) => {
      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= siblings.length) return siblings
      const copy = siblings.slice()
      ;[copy[index], copy[swapWith]] = [copy[swapWith], copy[index]]
      return copy
    }) ?? tasks
  )
}

/**
 * ドラッグ&ドロップでタスクを木構造の別位置へ移動する(純粋関数)。
 * position に応じて対象タスクの直前・直後(兄弟)、または子として差し込む。
 * 自分自身やその子孫の中へは移動できず(循環になるため)、その場合は無変更で返す。
 * タスクは丸ごと移動するので depends 参照(全 id が存続)は壊れない。
 */
export function moveTaskTo(
  tasks: Task[],
  id: string,
  targetId: string,
  position: DropPosition,
): Task[] {
  const moving = findTask(tasks, id)
  if (moving === undefined) return tasks
  // 自分自身・子孫の中(= moving の部分木)へは移動できない
  if (collectIds([moving]).has(targetId)) return tasks

  // まず現在位置から切り離す(targetId は moving の外なので detached に残る)
  const detached = transformSiblings(tasks, id, (siblings, index) =>
    siblings.filter((_, i) => i !== index),
  )
  if (detached === null) return tasks

  if (position === 'child') {
    return mapTask(detached, targetId, (parent) => ({
      ...parent,
      tasks: [...(parent.tasks ?? []), moving],
    }))
  }

  const offset = position === 'before' ? 0 : 1
  const inserted = transformSiblings(detached, targetId, (siblings, index) => {
    const copy = siblings.slice()
    copy.splice(index + offset, 0, moving)
    return copy
  })
  return inserted ?? tasks
}

/**
 * 平坦化済みタスク列(深さ付き)から、指定 id の祖先(親〜ルート)の id 集合を返す。
 * 子が親・先祖に依存する論理的循環を防ぐため、依存エディタの選択肢除外に使う。
 */
export function collectAncestors(
  allTasks: FlatTask[],
  id: string,
): Set<string> {
  const result = new Set<string>()
  const index = allTasks.findIndex((flat) => flat.task.id === id)
  if (index === -1) return result
  // 表示順(深さ優先)では、自分より前で深さが浅くなるたびに祖先が 1 段見つかる
  let depth = allTasks[index].depth
  for (let i = index - 1; i >= 0 && depth > 0; i -= 1) {
    if (allTasks[i].depth < depth) {
      result.add(allTasks[i].task.id)
      depth = allTasks[i].depth
    }
  }
  return result
}

// --- フィールド編集 ---

function applyFieldChanges(task: Task, changes: Partial<TaskFields>): Task {
  const next = { ...task } as Record<string, unknown>
  for (const [key, value] of Object.entries(changes)) {
    if (key !== 'title' && isEmptyValue(value)) {
      delete next[key]
    } else {
      next[key] = value
    }
  }
  return next as unknown as Task
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function setInfoTitle(spec: TaskSpec, title: string): TaskSpec {
  if (title === '') {
    if (spec.info === undefined) return spec
    const next = { ...spec }
    delete next.info
    return next
  }
  return { ...spec, info: { ...spec.info, title } }
}

// --- ツリー操作ヘルパー ---

function withTasks(spec: TaskSpec, tasks: Task[]): TaskSpec {
  return { ...spec, tasks }
}

function findTask(tasks: Task[], id: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === id) return task
    if (task.tasks) {
      const found = findTask(task.tasks, id)
      if (found) return found
    }
  }
  return undefined
}

/** 指定 id のタスクを fn で置き換えた新しいツリーを返す */
function mapTask(tasks: Task[], id: string, fn: (task: Task) => Task): Task[] {
  return tasks.map((task) => {
    if (task.id === id) return fn(task)
    if (task.tasks) {
      const children = mapTask(task.tasks, id, fn)
      if (children !== task.tasks) return { ...task, tasks: children }
    }
    return task
  })
}

/**
 * id を含む兄弟配列を見つけ、transform(siblings, index) の結果で置き換える。
 * 見つからなければ null を返す。
 */
function transformSiblings(
  tasks: Task[],
  id: string,
  transform: (siblings: Task[], index: number) => Task[],
): Task[] | null {
  const index = tasks.findIndex((task) => task.id === id)
  if (index !== -1) return transform(tasks, index)

  let changed = false
  const next = tasks.map((task): Task => {
    if (!task.tasks) return task
    const result = transformSiblings(task.tasks, id, transform)
    if (result) {
      changed = true
      return { ...task, tasks: result }
    }
    return task
  })
  return changed ? next : null
}

/** depends 配列から指定 id 群を取り除く(空になったら depends 自体を削除) */
function stripDependencies(tasks: Task[], removedIds: Set<string>): Task[] {
  return tasks.map((task): Task => {
    const children = task.tasks
      ? stripDependencies(task.tasks, removedIds)
      : undefined
    if (task.depends?.some((dep) => removedIds.has(dep))) {
      const filtered = task.depends.filter((dep) => !removedIds.has(dep))
      const next = { ...task }
      if (filtered.length > 0) {
        next.depends = filtered
      } else {
        delete next.depends
      }
      if (children) next.tasks = children
      return next
    }
    return children ? { ...task, tasks: children } : task
  })
}
