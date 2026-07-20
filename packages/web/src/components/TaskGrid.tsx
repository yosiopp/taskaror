/**
 * 左ペインの編集可能なタスクグリッド。
 * visibleRows(flattenScheduled の結果)を 1 行ずつ ROW_HEIGHT 固定で描き、
 * ガントと行を揃える。セルはインライン編集でき、コミットは updateTask を dispatch する。
 * カラムは columnState(gridColumns.ts)に従って表示/非表示・幅を切り替え、
 * 全カラムがペインに収まらないときはペイン内で横スクロールする。
 */
import { useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  PointerEvent,
  ReactElement,
} from 'react'
import type { GanttRow } from '@taskaror/core/gantt'
import { collectAncestors } from '@taskaror/core/editor'
import type { DropPosition, TaskFields } from '@taskaror/core/editor'
import { ESTIMATE_RE } from '@taskaror/core/estimate'
import type { FlatTask } from '@taskaror/core/taskspec'
import type { Task } from '@taskaror/core/types/taskspec'
import { HEADER_HEIGHT, ROW_HEIGHT } from './constants'
import {
  GRID_COLUMN_MAX_WIDTH,
  columnWidth,
  gridTemplate,
  isColumnVisible,
  totalColumnsWidth,
  visibleColumnDefs,
} from './gridColumns'
import type {
  GridColumnDef,
  GridColumnKey,
  GridColumnState,
} from './gridColumns'

/** インライン編集できる列(依存は専用ポップオーバーのため含めない) */
type EditableField =
  'title' | 'estimate' | 'start' | 'assignees' | 'tags' | 'progress'

const EDITABLE_FIELDS: EditableField[] = [
  'title',
  'estimate',
  'start',
  'assignees',
  'tags',
  'progress',
]

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
  /** グリッド列の幅(px)。セパレータのドラッグで変わる */
  gridWidth: number
  /** カラムの表示状態と幅([表示] → [カラム] メニューとドラッグで変わる) */
  columnState: GridColumnState
  /** 列見出しの境界ドラッグ・キー操作での列幅変更を反映する */
  onResizeColumn: (key: GridColumnKey, width: number) => void
  /** 行を選択する。空グリッド行へフォーカスを移すときは null で選択解除する */
  onSelect: (id: string | null) => void
  onToggleCollapse: (id: string) => void
  onUpdate: (id: string, changes: Partial<TaskFields>) => void
  /** ドラッグ&ドロップで id を targetId の前/後/子へ移動する */
  onMove: (id: string, targetId: string, position: DropPosition) => void
  /** 空行クリックでルート末尾に新規タスクを作成し、作成したタスクを返す */
  onCreateTask: () => Task
  /** ダブルクリックで編集ダイアログを開く */
  onOpenDialog: (id: string) => void
}

/** 初期表示する空グリッド行の数(スプレッドシート風。行追加 UI で増やせる) */
const INITIAL_EMPTY_ROWS = 100
/** 「行を追加」で一度に増やす行数の既定値 */
const ADD_ROWS_STEP = 100

function TaskGrid(props: TaskGridProps) {
  const {
    visibleRows,
    allTasks,
    selectedId,
    gridWidth,
    columnState,
    onResizeColumn,
    onSelect,
    onToggleCollapse,
    onUpdate,
    onMove,
    onCreateTask,
    onOpenDialog,
  } = props

  const [editing, setEditing] = useState<EditingCell | null>(null)
  // 表示する空行数(スプレッドシート風。行追加 UI で増やす)
  const [emptyRows, setEmptyRows] = useState(INITIAL_EMPTY_ROWS)
  // ↑/↓ で空グリッド行へ移したフォーカス位置(0 始まりの空行番号)。null は空行未フォーカス
  const [emptyFocus, setEmptyFocus] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  // キーボード移動でセルを切り替える際、旧 input の blur による二重処理を防ぐ
  const suppressBlurRef = useRef(false)
  // 本文コンテナ。↑/↓ でのフォーカス移動時の keydown 受けとスクロールに使う
  const bodyRef = useRef<HTMLDivElement>(null)
  // ドラッグ中のタスク id と、現在のドロップ先(挿入インジケータ用)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    id: string
    position: DropPosition
  } | null>(null)

  // --- カラム構成と横スクロール ---
  // ペイン(.grid-col)は overflow-x: clip でスクロールコンテナにしない
  // (ヘッダの sticky top を共有スクロール容器基準のまま保つため)。
  // 横スクロールは sticky bottom の細いスクロールバー(.grid-hscroll)を実体とし、
  // その scrollLeft をヘッダ/行トラックの left オフセットに反映して実現する。
  const colRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const hscrollRef = useRef<HTMLDivElement>(null)
  const [scrollX, setScrollX] = useState(0)

  const columns = visibleColumnDefs(columnState)
  const template = gridTemplate(columnState)
  const totalWidth = totalColumnsWidth(columnState)
  // インライン編集対象のうち表示中の列(Tab 移動は非表示列を飛ばす)
  const editableFields = EDITABLE_FIELDS.filter((field) =>
    isColumnVisible(columnState, field),
  )

  // ペインの内容幅(境界線 1px を除く)に全カラムが収まらない分だけスクロールできる
  const maxScrollX = Math.max(0, totalWidth - Math.max(0, gridWidth - 1))
  const offsetX = Math.min(scrollX, maxScrollX)
  // トラックはカラム合計幅。ペインの方が広ければ 100% に伸ばし、
  // 末尾のフィラー列(minmax(0, 1fr))が右側の余白を埋める
  const trackStyle = {
    width: totalWidth,
    minWidth: '100%',
    left: -offsetX,
  } as const

  // 横ホイール・トラックパッドの横パン(と Shift+縦ホイール)で列を横スクロールする。
  // 共有スクロール容器(ガント側の横スクロール)へ伝播させないため preventDefault が
  // 必要で、React の onWheel は passive 登録のため使えない。native リスナを自前で張る。
  useEffect(() => {
    const el = colRef.current
    if (el === null) return
    const handleWheel = (event: WheelEvent): void => {
      const bar = hscrollRef.current
      if (bar === null) return
      const delta =
        event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0
      if (delta === 0) return
      const max = bar.scrollWidth - bar.clientWidth
      const next = Math.min(Math.max(bar.scrollLeft + delta, 0), max)
      // 端に達していたら消費せず、外側(ガント)のスクロールに委ねる
      if (next === bar.scrollLeft) return
      event.preventDefault()
      bar.scrollLeft = next
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // スクロールバーの実位置を描画中のオフセットに合わせる(列の表示切替などで
  // バーが付け直された直後や、スクロール上限が縮んだときのずれを解消する)
  useEffect(() => {
    const bar = hscrollRef.current
    if (bar !== null && bar.scrollLeft !== offsetX) bar.scrollLeft = offsetX
  }, [offsetX, maxScrollX])

  // 実効的な空行フォーカス。空行フォーカスは「タスク未選択」のときだけ意味を持つ。
  // こうすると、クリック選択・セル編集・グローバルショートカット(Insert 追加等)・
  // ガント側の選択など、どの経路で selectedId が付いても空行の強調を自動で畳めて、
  // 選択ハイライトの二重化を防げる(emptyFocus を都度リセットする副作用が要らない)。
  const activeEmptyFocus = selectedId === null ? emptyFocus : null

  const startEdit = (id: string, field: EditableField, task: Task): void => {
    if (editing && editing.id === id && editing.field === field) return
    onSelect(id)
    setEditing({ id, field })
    setDraft(fieldToString(task, field))
  }

  /**
   * 空行から新規タスクを作成する(スプレッドシート風)。末尾にタスクを作り、
   * 続けて名称を打てるよう名称セルの編集をすぐ開始する。
   * onCreateTask は id を同期に採番するので、次のレンダーで新規行が現れると
   * その名称セルが入力状態で描画される。initialTitle を渡すと、キー入力で
   * 打ち始めた 1 文字を名称の初期値として引き継ぐ。
   */
  const createTaskFromEmpty = (initialTitle?: string): void => {
    const task = onCreateTask()
    setEditing({ id: task.id, field: 'title' })
    setDraft(initialTitle ?? task.title)
  }

  /** 空行クリックでの新規作成(名称の初期値は空のまま) */
  const handleEmptyRowClick = (): void => {
    createTaskFromEmpty()
  }

  /**
   * 行のダブルクリックで編集ダイアログを開く。
   * 1 クリック目でインラインセル編集が始まっていることがあるため、
   * それを打ち切ってからダイアログを開く(モーダルが前面に出るので競合しない)。
   */
  const handleRowDoubleClick = (id: string): void => {
    setEditing(null)
    onOpenDialog(id)
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
      // これ以上移動先がない(端で確定した)場合は編集を終え、
      // 行移動の ↑/↓ を再び受けられるようグリッド本体へフォーカスを戻す
      setEditing(null)
      focusBody()
    }
    // 移動後に blur が発生しなかった場合に備え、抑制フラグを解除しておく
    window.setTimeout(() => {
      suppressBlurRef.current = false
    }, 0)
  }

  /**
   * グリッド本体へフォーカスを戻す。セル編集の input が unmount されると
   * ↑/↓ を受ける .grid-body からフォーカスが外れて行移動できなくなるため、
   * Esc / キーボードでの編集終了後に呼んで復帰させる。
   */
  const focusBody = (): void => {
    bodyRef.current?.focus()
  }

  const cancel = (): void => {
    suppressBlurRef.current = true
    setEditing(null)
    focusBody()
    window.setTimeout(() => {
      suppressBlurRef.current = false
    }, 0)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (!editing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      navigate(neighborCell(visibleRows, editing, 'down', editableFields))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      navigate(
        neighborCell(
          visibleRows,
          editing,
          event.shiftKey ? 'left' : 'right',
          editableFields,
        ),
      )
    }
  }

  // --- ↑/↓ での行フォーカス移動(本文コンテナで keydown を拾う) ---
  // タスク行と空グリッド行は行トラック(rowsRef)の直接の子 div として
  // visibleRows → 空行の順に並ぶので、子インデックスはタスク行 = i、
  // 空行 = visibleRows.length + e で引ける。

  /** index 番目のタスク行へフォーカス(選択)を移し、画面外なら可視化する */
  const focusTaskRow = (index: number): void => {
    setEmptyFocus(null)
    onSelect(visibleRows[index].scheduled.task.id)
    rowsRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
  }

  /** index 番目の空グリッド行へフォーカスを移す。タスク選択は解除する */
  const focusEmptyRow = (index: number): void => {
    onSelect(null)
    setEmptyFocus(index)
    rowsRef.current?.children[visibleRows.length + index]?.scrollIntoView({
      block: 'nearest',
    })
  }

  const handleBodyKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const { key } = event
    const isArrow = key === 'ArrowUp' || key === 'ArrowDown'
    // 空行フォーカス時の新規作成トリガに使う「表示可能な 1 文字入力」か
    // (修飾キー付きのショートカットは除外する)
    const isPrintable =
      key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
    if (!isArrow && key !== 'Enter' && !isPrintable) return
    // Ctrl/Cmd+矢印はグローバルのタスク上下移動に委ねる(行フォーカス移動はしない)
    if (event.ctrlKey || event.metaKey) return
    // セル編集中・依存チェックボックス等の入力にフォーカスがあるときは
    // 従来の Enter/Tab/Esc・入力操作を優先し、フォーカス移動と競合させない
    if (editing !== null || isFormField(event.target)) return

    const taskCount = visibleRows.length
    if (taskCount === 0 && emptyRows === 0) return

    const emptyIndex = activeEmptyFocus
    const taskIndex = visibleRows.findIndex(
      (row) => row.scheduled.task.id === selectedId,
    )

    // Enter: タスク行なら名前セル編集を開始、空行なら新規タスクを作成する
    if (key === 'Enter') {
      if (emptyIndex !== null) {
        event.preventDefault()
        createTaskFromEmpty()
      } else if (taskIndex !== -1) {
        event.preventDefault()
        const task = visibleRows[taskIndex].scheduled.task
        startEdit(task.id, 'title', task)
      }
      return
    }

    // 表示可能な 1 文字: 空行フォーカス時のみ、その文字を名称の初期値にして作成する。
    // (IME 変換中の日本語入力は div では捕捉できないため、その場合は Enter で作成する)
    if (isPrintable) {
      if (emptyIndex === null) return
      event.preventDefault()
      createTaskFromEmpty(key)
      return
    }

    // 以降は ↑/↓ の行フォーカス移動
    event.preventDefault()
    const down = key === 'ArrowDown'

    if (emptyIndex !== null) {
      // 空行内の移動。最上段の空行で ↑ を押すと末尾タスク行へ戻る
      if (down) {
        if (emptyIndex + 1 < emptyRows) focusEmptyRow(emptyIndex + 1)
      } else if (emptyIndex > 0) {
        focusEmptyRow(emptyIndex - 1)
      } else if (taskCount > 0) {
        focusTaskRow(taskCount - 1)
      }
      return
    }

    if (taskIndex === -1) {
      // 未フォーカス: ↓ は先頭、↑ は末尾から入る(タスクが無ければ空行へ)
      if (down) {
        if (taskCount > 0) focusTaskRow(0)
        else focusEmptyRow(0)
      } else if (taskCount > 0) {
        focusTaskRow(taskCount - 1)
      }
      return
    }

    // タスク行内の移動。末尾タスクで ↓ を押すと直下の空グリッド行へ移る
    if (down) {
      if (taskIndex + 1 < taskCount) focusTaskRow(taskIndex + 1)
      else if (emptyRows > 0) focusEmptyRow(0)
    } else if (taskIndex > 0) {
      focusTaskRow(taskIndex - 1)
    }
  }

  // --- ドラッグ&ドロップでのタスク移動 ---
  const handleDragStart = (event: DragEvent<HTMLElement>, id: string): void => {
    setDragId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    // グリップだけだと分かりにくいので、ドラッグ画像を行全体にする
    const rowEl = event.currentTarget.closest('.grid-row')
    if (rowEl instanceof HTMLElement) {
      event.dataTransfer.setDragImage(rowEl, 12, 12)
    }
  }

  const handleDragEnd = (): void => {
    setDragId(null)
    setDropTarget(null)
  }

  /**
   * 行内のドロップ位置を判定する。上寄り=直前 / 下寄り=直後(いずれも兄弟)、
   * 中央=子(リペアレント)。自分自身・子孫の中へは移動不可で null を返す。
   */
  const dropPositionFor = (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ): DropPosition | null => {
    if (dragId === null || dragId === targetId) return null
    if (collectSelfAndDescendants(allTasks, dragId).has(targetId)) return null
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - rect.top) / rect.height
    if (ratio < 0.3) return 'before'
    if (ratio > 0.7) return 'after'
    return 'child'
  }

  const handleRowDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ): void => {
    // 内部ドラッグでないとき(ファイル読み込み等)は App 側に委ねる
    if (dragId === null) return
    const position = dropPositionFor(event, targetId)
    if (position === null) {
      event.dataTransfer.dropEffect = 'none'
      if (dropTarget !== null) setDropTarget(null)
      return
    }
    event.preventDefault() // drop を許可するために必要
    event.dataTransfer.dropEffect = 'move'
    if (dropTarget?.id !== targetId || dropTarget.position !== position) {
      setDropTarget({ id: targetId, position })
    }
  }

  const handleRowDrop = (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ): void => {
    if (dragId === null) return
    const position = dropPositionFor(event, targetId)
    event.preventDefault()
    const moving = dragId
    setDragId(null)
    setDropTarget(null)
    if (position !== null) onMove(moving, targetId, position)
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
        : field === 'assignees' || field === 'tags'
          ? 'カンマ区切り'
          : ''
    return <input type="text" placeholder={placeholder} {...common} />
  }

  const isEditing = (id: string, field: EditableField): boolean =>
    editing !== null && editing.id === id && editing.field === field

  const visible = (key: GridColumnKey): boolean =>
    isColumnVisible(columnState, key)

  // 列見出しの境界に置くリサイザ(各列の右端 = 先頭からの累積幅に絶対配置する)
  const columnResizers = columns.map((def, index) => (
    <ColumnResizer
      key={def.key}
      def={def}
      left={columns
        .slice(0, index + 1)
        .reduce((sum, d) => sum + columnWidth(columnState, d.key), 0)}
      width={columnWidth(columnState, def.key)}
      onResize={(width) => onResizeColumn(def.key, width)}
    />
  ))

  return (
    <div
      className="grid-col"
      ref={colRef}
      style={{ flex: `0 0 ${gridWidth}px`, width: gridWidth }}
    >
      <div className="grid-header" style={{ height: HEADER_HEIGHT }}>
        <div
          className="grid-header-track"
          style={{ ...trackStyle, gridTemplateColumns: template }}
        >
          {columns.map((def) => (
            <span key={def.key} className="grid-th">
              {def.label}
            </span>
          ))}
          {/* フィラー列(右側の余白)にも見出し背景と列罫線を通す */}
          <span className="grid-th" aria-hidden="true" />
          {columnResizers}
        </div>
      </div>

      <div
        className="grid-body"
        ref={bodyRef}
        tabIndex={0}
        onKeyDown={handleBodyKeyDown}
      >
        <div className="grid-rows-track" ref={rowsRef} style={trackStyle}>
          {visibleRows.map((row) => {
            const task = row.scheduled.task
            const selected = task.id === selectedId
            const dropClass =
              dropTarget?.id === task.id ? ` drop-${dropTarget.position}` : ''
            return (
              <div
                key={task.id}
                className={`grid-row${selected ? ' selected' : ''}${dropClass}`}
                style={{ height: ROW_HEIGHT, gridTemplateColumns: template }}
                onClick={() => onSelect(task.id)}
                onDoubleClick={() => handleRowDoubleClick(task.id)}
                onDragOver={(event) => handleRowDragOver(event, task.id)}
                onDrop={(event) => handleRowDrop(event, task.id)}
              >
                {/* タスク名(グリップ + インデント + 展開折りたたみ + 名称編集) */}
                <div
                  className="grid-cell cell-name"
                  style={{ paddingLeft: 6 + row.depth * 16 }}
                >
                  <span
                    className="drag-handle"
                    draggable
                    role="button"
                    aria-label="ドラッグして移動"
                    title="ドラッグして移動"
                    onDragStart={(event) => handleDragStart(event, task.id)}
                    onDragEnd={handleDragEnd}
                  >
                    ⠿
                  </span>
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
                {visible('assignees') ? (
                  <EditableCell
                    editing={isEditing(task.id, 'assignees')}
                    display={(task.assignees ?? []).join(', ')}
                    onActivate={() => startEdit(task.id, 'assignees', task)}
                    input={renderInput('assignees')}
                  />
                ) : null}
                {visible('tags') ? (
                  <EditableCell
                    editing={isEditing(task.id, 'tags')}
                    display={(task.tags ?? []).join(', ')}
                    onActivate={() => startEdit(task.id, 'tags', task)}
                    input={renderInput('tags')}
                  />
                ) : null}
                {visible('progress') ? (
                  <EditableCell
                    editing={isEditing(task.id, 'progress')}
                    display={task.progress != null ? `${task.progress}%` : ''}
                    onActivate={() => startEdit(task.id, 'progress', task)}
                    input={renderInput('progress')}
                  />
                ) : null}

                <DependsEditor
                  task={task}
                  allTasks={allTasks}
                  onChange={(depends) => onUpdate(task.id, { depends })}
                />
                {/* フィラー列。依存列の右側にも列罫線を通す */}
                <span className="grid-cell" aria-hidden="true" />
              </div>
            )
          })}

          {/* 空行(スプレッドシート風)。クリック、または ↑/↓ でフォーカスして
              文字入力/Enter で末尾に新規タスクを作る */}
          {Array.from({ length: emptyRows }, (_, i) => (
            <div
              key={`empty-${i}`}
              className={`grid-row grid-row-empty${activeEmptyFocus === i ? ' focused' : ''}`}
              style={{ height: ROW_HEIGHT, gridTemplateColumns: template }}
              onClick={handleEmptyRowClick}
              title="クリックして新しいタスクを追加"
            >
              {/* 表示列 + フィラー列のセルを描いて列罫線を通す */}
              {Array.from({ length: columns.length + 1 }, (_, c) => (
                <span key={c} className="grid-cell" aria-hidden="true" />
              ))}
            </div>
          ))}
        </div>

        {/* 最下端の行追加 UI(スプレッドシート風の「○行 追加」)。
            横スクロールに追従させず、ペイン幅のまま据え置く */}
        <div className="grid-add-rows">
          <button
            type="button"
            className="grid-add-rows-btn"
            onClick={() => setEmptyRows((n) => n + ADD_ROWS_STEP)}
          >
            ＋ {ADD_ROWS_STEP} 行 追加
          </button>
        </div>
      </div>

      {/* 全カラムがペインに収まらないときだけ出す横スクロールバー。
          sticky bottom で常に画面下端に見え、これが横スクロール量の実体になる */}
      {maxScrollX > 0 ? (
        <div
          className="grid-hscroll"
          ref={hscrollRef}
          onScroll={(event) => setScrollX(event.currentTarget.scrollLeft)}
        >
          <div className="grid-hscroll-spacer" style={{ width: totalWidth }} />
        </div>
      ) : null}
    </div>
  )
}

/** 列幅の微調整キー幅(Shift 併用で大きく動かす) */
const COL_KEY_STEP = 8
const COL_KEY_STEP_LARGE = 32

interface ColumnResizerProps {
  def: GridColumnDef
  /** トラック左端からの境界位置(px)= この列の右端 */
  left: number
  /** この列の現在幅(px) */
  width: number
  /** ドラッグ・キー操作での幅変更(クランプは呼び出し側の setColumnWidth が行う) */
  onResize: (width: number) => void
}

/**
 * 列見出しの右境界に置くリサイザ。ドラッグ・左右キーで列幅を変更し、
 * ダブルクリックで既定幅に戻す(ペインのセパレータと同じ操作感)。
 */
function ColumnResizer({ def, left, width, onResize }: ColumnResizerProps) {
  // ドラッグ開始時の clientX と列幅。null なら非ドラッグ
  const startRef = useRef<{ x: number; width: number } | null>(null)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    // テキスト選択やフォーカス移動を抑止しつつドラッグを開始する
    event.preventDefault()
    startRef.current = { x: event.clientX, width }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add('is-resizing-cols')
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = startRef.current
    if (start === null) return
    onResize(start.width + (event.clientX - start.x))
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (startRef.current === null) return
    startRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.classList.remove('is-resizing-cols')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? COL_KEY_STEP_LARGE : COL_KEY_STEP
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = width - step
    else if (event.key === 'ArrowRight') next = width + step
    if (next === null) return
    event.preventDefault()
    onResize(next)
  }

  return (
    <div
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={`${def.label}列の幅。ドラッグまたは左右キーで変更`}
      aria-valuenow={width}
      aria-valuemin={def.minWidth}
      aria-valuemax={GRID_COLUMN_MAX_WIDTH}
      tabIndex={0}
      style={{ left }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onResize(def.defaultWidth)}
    />
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

  // 自分自身・子孫に加えて祖先も依存先にできない(子が親/先祖に依存する
  // 論理的循環を防ぐ)ので除外する
  const excluded = collectSelfAndDescendants(allTasks, task.id)
  const ancestors = collectAncestors(allTasks, task.id)
  const options = allTasks.filter(
    (flat) => !excluded.has(flat.task.id) && !ancestors.has(flat.task.id),
  )

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

/** イベントの発火元が入力系要素(input / textarea / select)か */
function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

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
    case 'tags':
      return (task.tags ?? []).join(', ')
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
    case 'tags':
      return { tags: splitCsv(value) }
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
 * fields には表示中の編集可能列を渡す(非表示列は Tab 移動でも飛ばす)。
 */
function neighborCell(
  rows: GanttRow[],
  cell: EditingCell,
  direction: 'down' | 'up' | 'left' | 'right',
  fields: EditableField[],
): EditingCell | null {
  const rowIndex = rows.findIndex((row) => row.scheduled.task.id === cell.id)
  if (rowIndex === -1) return null
  const colIndex = fields.indexOf(cell.field)
  if (colIndex === -1) return null

  if (direction === 'down' || direction === 'up') {
    const nextRow = rowIndex + (direction === 'down' ? 1 : -1)
    if (nextRow < 0 || nextRow >= rows.length) return null
    return { id: rows[nextRow].scheduled.task.id, field: cell.field }
  }

  // 左右: 列を移動し、端では前後の行へ折り返す
  const step = direction === 'right' ? 1 : -1
  let nextCol = colIndex + step
  let nextRow = rowIndex
  if (nextCol >= fields.length) {
    nextCol = 0
    nextRow += 1
  } else if (nextCol < 0) {
    nextCol = fields.length - 1
    nextRow -= 1
  }
  if (nextRow < 0 || nextRow >= rows.length) return null
  return {
    id: rows[nextRow].scheduled.task.id,
    field: fields[nextCol],
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
