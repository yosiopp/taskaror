/**
 * 左ペインの編集可能なタスクグリッド。
 * visibleRows(flattenScheduled の結果)を 1 行ずつ ROW_HEIGHT 固定で描き、
 * ガントと行を揃える。セルはインライン編集でき、コミットは updateTask を dispatch する。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  KeyboardEvent,
  ReactElement,
  RefObject,
  UIEvent,
} from 'react'
import type { GanttRow } from '../lib/gantt'
import type { TaskFields } from '../lib/editor'
import type { FlatTask } from '../lib/taskspec'
import type { Task } from '../types/taskspec'
import {
  GRID_COLUMNS,
  GRID_WIDTH,
  HEADER_HEIGHT,
  ROW_HEIGHT,
} from './constants'

/** インライン編集できる列(依存は専用ポップオーバーのため含めない) */
type EditableField = 'title' | 'estimate' | 'start' | 'assignees' | 'progress'

const EDITABLE_FIELDS: EditableField[] = [
  'title',
  'estimate',
  'start',
  'assignees',
  'progress',
]

/** estimate の妥当な入力形式(空、または数値+h/d) */
const ESTIMATE_RE = /^\d+(\.\d+)?(h|d)$/

interface EditingCell {
  id: string
  field: EditableField
}

export interface TaskGridProps {
  /** 表示行(ガントと共有) */
  visibleRows: GanttRow[]
  /** 依存編集の選択肢に使う全タスク(深さ付き平坦化) */
  allTasks: FlatTask[]
  selectedId: string | null
  /** スクロール同期用のコンテナ ref */
  scrollRef: RefObject<HTMLDivElement | null>
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  onSelect: (id: string) => void
  onToggleCollapse: (id: string) => void
  onUpdate: (id: string, changes: Partial<TaskFields>) => void
}

function TaskGrid(props: TaskGridProps) {
  const {
    visibleRows,
    allTasks,
    selectedId,
    scrollRef,
    onScroll,
    onSelect,
    onToggleCollapse,
    onUpdate,
  } = props

  const [editing, setEditing] = useState<EditingCell | null>(null)
  const [draft, setDraft] = useState('')
  // キーボード移動でセルを切り替える際、旧 input の blur による二重処理を防ぐ
  const suppressBlurRef = useRef(false)

  const startEdit = (id: string, field: EditableField, task: Task): void => {
    if (editing && editing.id === id && editing.field === field) return
    onSelect(id)
    setEditing({ id, field })
    setDraft(fieldToString(task, field))
  }

  const commit = (cell: EditingCell, value: string): void => {
    const changes = buildChanges(cell.field, value)
    if (changes !== null) onUpdate(cell.id, changes)
  }

  const handleBlur = (): void => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    if (editing) commit(editing, draft)
    setEditing(null)
  }

  /** 現在のセルをコミットして next(なければ編集終了)へ移る */
  const navigate = (next: EditingCell | null): void => {
    if (!editing) return
    suppressBlurRef.current = true
    commit(editing, draft)
    if (next) {
      const task = findTask(visibleRows, next.id)
      setEditing(next)
      setDraft(task ? fieldToString(task, next.field) : '')
    } else {
      setEditing(null)
    }
    // 移動後に blur が発生しなかった場合に備え、抑制フラグを解除しておく
    window.setTimeout(() => {
      suppressBlurRef.current = false
    }, 0)
  }

  const cancel = (): void => {
    suppressBlurRef.current = true
    setEditing(null)
    window.setTimeout(() => {
      suppressBlurRef.current = false
    }, 0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!editing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      navigate(neighborCell(visibleRows, editing, 'down'))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      navigate(
        neighborCell(visibleRows, editing, event.shiftKey ? 'left' : 'right'),
      )
    }
  }

  const renderInput = (field: EditableField): ReactElement => {
    const common = {
      className: 'grid-input',
      autoFocus: true,
      value: draft,
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setDraft(event.target.value),
      onKeyDown: handleKeyDown,
      onBlur: handleBlur,
    }
    if (field === 'start') return <input type="date" {...common} />
    if (field === 'progress') {
      return <input type="number" min={0} max={100} step={1} {...common} />
    }
    const placeholder =
      field === 'estimate'
        ? '例: 1.5d'
        : field === 'assignees'
          ? 'カンマ区切り'
          : ''
    return <input type="text" placeholder={placeholder} {...common} />
  }

  const isEditing = (id: string, field: EditableField): boolean =>
    editing !== null && editing.id === id && editing.field === field

  return (
    <div
      className="grid-pane"
      ref={scrollRef}
      onScroll={onScroll}
      style={{ flex: `0 0 ${GRID_WIDTH}px`, width: GRID_WIDTH }}
    >
      <div
        className="grid-header"
        style={{
          height: HEADER_HEIGHT,
          gridTemplateColumns: GRID_COLUMNS,
        }}
      >
        <span className="grid-th">タスク名</span>
        <span className="grid-th">見積</span>
        <span className="grid-th">開始</span>
        <span className="grid-th">担当</span>
        <span className="grid-th">進捗</span>
        <span className="grid-th">依存</span>
      </div>

      <div className="grid-body">
        {visibleRows.map((row) => {
          const task = row.scheduled.task
          const selected = task.id === selectedId
          return (
            <div
              key={task.id}
              className={`grid-row${selected ? ' selected' : ''}`}
              style={{ height: ROW_HEIGHT, gridTemplateColumns: GRID_COLUMNS }}
              onClick={() => onSelect(task.id)}
            >
              {/* タスク名(インデント + 展開折りたたみ + 名称編集) */}
              <div
                className="grid-cell cell-name"
                style={{ paddingLeft: 6 + row.depth * 16 }}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="collapse-toggle"
                    aria-label={row.collapsed ? '展開' : '折りたたみ'}
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleCollapse(task.id)
                    }}
                  >
                    {row.collapsed ? '▶' : '▼'}
                  </button>
                ) : (
                  <span className="collapse-spacer" aria-hidden="true" />
                )}
                {isEditing(task.id, 'title') ? (
                  renderInput('title')
                ) : (
                  <span
                    className="cell-text title"
                    onClick={(event) => {
                      event.stopPropagation()
                      startEdit(task.id, 'title', task)
                    }}
                  >
                    {task.title || '(無題)'}
                  </span>
                )}
              </div>

              <EditableCell
                editing={isEditing(task.id, 'estimate')}
                display={task.estimate ?? ''}
                onActivate={() => startEdit(task.id, 'estimate', task)}
                input={renderInput('estimate')}
              />
              <EditableCell
                editing={isEditing(task.id, 'start')}
                display={row.scheduled.start}
                muted={task.start === undefined}
                onActivate={() => startEdit(task.id, 'start', task)}
                input={renderInput('start')}
              />
              <EditableCell
                editing={isEditing(task.id, 'assignees')}
                display={(task.assignees ?? []).join(', ')}
                onActivate={() => startEdit(task.id, 'assignees', task)}
                input={renderInput('assignees')}
              />
              <EditableCell
                editing={isEditing(task.id, 'progress')}
                display={task.progress != null ? `${task.progress}%` : ''}
                onActivate={() => startEdit(task.id, 'progress', task)}
                input={renderInput('progress')}
              />

              <DependsEditor
                task={task}
                allTasks={allTasks}
                onChange={(depends) => onUpdate(task.id, { depends })}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface EditableCellProps {
  editing: boolean
  display: string
  /** 導出値など、明示入力でない値を淡色で示す */
  muted?: boolean
  onActivate: () => void
  input: ReactElement
}

/** 汎用の編集可能セル(表示 ⇔ input を切り替える) */
function EditableCell({
  editing,
  display,
  muted,
  onActivate,
  input,
}: EditableCellProps) {
  if (editing) {
    return <div className="grid-cell">{input}</div>
  }
  return (
    <div
      className="grid-cell editable"
      onClick={(event) => {
        event.stopPropagation()
        onActivate()
      }}
    >
      {display === '' ? (
        <span className="cell-placeholder">—</span>
      ) : (
        <span className={muted ? 'cell-text muted' : 'cell-text'}>
          {display}
        </span>
      )}
    </div>
  )
}

interface DependsEditorProps {
  task: Task
  allTasks: FlatTask[]
  onChange: (depends: string[]) => void
}

/** 依存(depends)を既存タスクからの複数選択で編集するポップオーバー */
function DependsEditor({ task, allTasks, onChange }: DependsEditorProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const depends = task.depends ?? []
  const open = pos !== null

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent): void => {
      const node = event.target as Node
      if (
        !containerRef.current?.contains(node) &&
        !popoverRef.current?.contains(node)
      ) {
        setPos(null)
      }
    }
    // ポップオーバーは fixed 座標で固定表示のため、外側をスクロールされると
    // ボタンから離れて取り残される。ポップオーバー内スクロールは除き、閉じる。
    const handleScroll = (event: Event): void => {
      if (popoverRef.current?.contains(event.target as Node)) return
      setPos(null)
    }
    document.addEventListener('mousedown', handlePointer)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  // 自分自身とその子孫は依存先にできないので除外する
  const excluded = collectSelfAndDescendants(allTasks, task.id)
  const options = allTasks.filter((flat) => !excluded.has(flat.task.id))

  const toggleOpen = (): void => {
    if (open) {
      setPos(null)
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    // スクロールコンテナに切り取られないよう fixed で表示し、右端を揃える
    const width = 240
    setPos({ top: rect.bottom + 2, left: Math.max(8, rect.right - width) })
  }

  const toggle = (id: string): void => {
    const next = depends.includes(id)
      ? depends.filter((dep) => dep !== id)
      : [...depends, id]
    onChange(next)
  }

  return (
    <div className="grid-cell depends-cell" ref={containerRef}>
      <button
        type="button"
        className="depends-button"
        title={depends.join(', ')}
        onClick={(event) => {
          event.stopPropagation()
          toggleOpen()
        }}
      >
        {depends.length === 0 ? (
          <span className="cell-placeholder">—</span>
        ) : (
          <span className="cell-text">{depends.join(', ')}</span>
        )}
      </button>
      {pos !== null ? (
        <div
          className="depends-popover"
          ref={popoverRef}
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <p className="depends-empty">選択できるタスクがありません</p>
          ) : (
            <ul className="depends-list">
              {options.map((flat) => (
                <li key={flat.task.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={depends.includes(flat.task.id)}
                      onChange={() => toggle(flat.task.id)}
                    />
                    <span className="depends-id">{flat.task.id}</span>
                    <span className="depends-title">{flat.task.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

// --- ヘルパー ---

/** 表示用にタスクのフィールド値を文字列化する(編集開始時の初期値) */
function fieldToString(task: Task, field: EditableField): string {
  switch (field) {
    case 'title':
      return task.title
    case 'estimate':
      return task.estimate ?? ''
    case 'start':
      return task.start ?? ''
    case 'assignees':
      return (task.assignees ?? []).join(', ')
    case 'progress':
      return task.progress != null ? String(task.progress) : ''
  }
}

/**
 * 入力文字列を TaskFields の変更に変換する。
 * コミットすべきでない不正入力(estimate の形式違反・progress の非数値)は null を返す。
 */
function buildChanges(
  field: EditableField,
  raw: string,
): Partial<TaskFields> | null {
  const value = raw.trim()
  switch (field) {
    case 'title':
      return { title: value }
    case 'estimate':
      if (value === '') return { estimate: '' }
      return ESTIMATE_RE.test(value) ? { estimate: value } : null
    case 'start':
      return { start: value }
    case 'assignees':
      return { assignees: splitCsv(value) }
    case 'progress': {
      if (value === '') return { progress: undefined }
      const num = Number(value)
      if (Number.isNaN(num)) return null
      return { progress: clamp(Math.round(num), 0, 100) }
    }
  }
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** visibleRows から id のタスクを引く */
function findTask(rows: GanttRow[], id: string): Task | undefined {
  return rows.find((row) => row.scheduled.task.id === id)?.scheduled.task
}

/**
 * 現在セルの上下左右の隣接セルを返す。端では折り返す / null(移動なし)を返す。
 */
function neighborCell(
  rows: GanttRow[],
  cell: EditingCell,
  direction: 'down' | 'up' | 'left' | 'right',
): EditingCell | null {
  const rowIndex = rows.findIndex((row) => row.scheduled.task.id === cell.id)
  if (rowIndex === -1) return null
  const colIndex = EDITABLE_FIELDS.indexOf(cell.field)

  if (direction === 'down' || direction === 'up') {
    const nextRow = rowIndex + (direction === 'down' ? 1 : -1)
    if (nextRow < 0 || nextRow >= rows.length) return null
    return { id: rows[nextRow].scheduled.task.id, field: cell.field }
  }

  // 左右: 列を移動し、端では前後の行へ折り返す
  const step = direction === 'right' ? 1 : -1
  let nextCol = colIndex + step
  let nextRow = rowIndex
  if (nextCol >= EDITABLE_FIELDS.length) {
    nextCol = 0
    nextRow += 1
  } else if (nextCol < 0) {
    nextCol = EDITABLE_FIELDS.length - 1
    nextRow -= 1
  }
  if (nextRow < 0 || nextRow >= rows.length) return null
  return {
    id: rows[nextRow].scheduled.task.id,
    field: EDITABLE_FIELDS[nextCol],
  }
}

/** 全タスク(平坦化済み)から、指定 id 自身とその子孫の id 集合を作る */
function collectSelfAndDescendants(
  allTasks: FlatTask[],
  id: string,
): Set<string> {
  const result = new Set<string>()
  const index = allTasks.findIndex((flat) => flat.task.id === id)
  if (index === -1) return result
  const baseDepth = allTasks[index].depth
  result.add(id)
  for (let i = index + 1; i < allTasks.length; i += 1) {
    if (allTasks[i].depth <= baseDepth) break
    result.add(allTasks[i].task.id)
  }
  return result
}

export default TaskGrid
