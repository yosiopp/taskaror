/**
 * ガントエディタのルート。状態(spec / collapsedIds / selectedId)を束ね、
 * spec からスケジュール・ガントレイアウトを派生させて左グリッドと右ガントに渡す。
 * すべて spec / collapsedIds からの useMemo 派生なので、dispatch すると
 * 自動的に再スケジュール・再レイアウト・再描画される(編集のリアルタイム反映)。
 */
import './App.css'
import { useMemo, useReducer, useRef, useState } from 'react'
import sampleSource from '../examples/ecommerce.taskspec.yaml?raw'
import Toolbar from './components/Toolbar'
import TaskGrid from './components/TaskGrid'
import GanttChart from './components/GanttChart'
import { DAY_WIDTH, ROW_HEIGHT } from './components/constants'
import { editorReducer, newTask } from './lib/editor'
import type { AddMode, TaskFields } from './lib/editor'
import { flattenTasks, parseTaskSpec } from './lib/taskspec'
import { scheduleTasks } from './lib/schedule'
import { computeGanttLayout, flattenScheduled } from './lib/gantt'
import type { GanttLayout, GanttRow } from './lib/gantt'

interface Derived {
  visibleRows: GanttRow[]
  layout: GanttLayout
}

const EMPTY_LAYOUT: GanttLayout = computeGanttLayout([], {
  dayWidth: DAY_WIDTH,
  rowHeight: ROW_HEIGHT,
})

function App() {
  const [spec, dispatch] = useReducer(editorReducer, undefined, () =>
    parseTaskSpec(sampleSource),
  )
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 依存編集の選択肢に使う全タスク(深さ付き)
  const allTasks = useMemo(() => flattenTasks(spec.tasks), [spec])

  // spec / collapsedIds からスケジュール・ガントレイアウトを派生させる。
  // 不正な estimate 等で scheduleTasks が throw しうるので try/catch で囲む。
  const computation = useMemo<
    { ok: true; derived: Derived } | { ok: false; error: string }
  >(() => {
    try {
      const scheduled = scheduleTasks(spec)
      const rows = flattenScheduled(scheduled, collapsedIds)
      const layout = computeGanttLayout(rows, {
        dayWidth: DAY_WIDTH,
        rowHeight: ROW_HEIGHT,
      })
      return { ok: true, derived: { visibleRows: rows, layout } }
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      return { ok: false, error: message }
    }
  }, [spec, collapsedIds])

  // 直近の正常な派生結果を保持し、計算失敗時はこれを表示し続ける(アプリを落とさない)。
  // 正常に計算できたらレンダー中に取り込む(収束するので追加のレンダーは 1 回のみ)。
  const [lastGood, setLastGood] = useState<Derived>({
    visibleRows: [],
    layout: EMPTY_LAYOUT,
  })
  if (computation.ok && computation.derived !== lastGood) {
    setLastGood(computation.derived)
  }

  const derived = computation.ok ? computation.derived : lastGood
  const { visibleRows, layout } = derived
  const error = computation.ok ? null : computation.error

  // --- スクロール同期(左グリッド ⇔ 右ガントの縦スクロール) ---
  const gridScrollRef = useRef<HTMLDivElement>(null)
  const ganttScrollRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)

  const syncScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ): void => {
    if (syncingRef.current || !source || !target) return
    syncingRef.current = true
    target.scrollTop = source.scrollTop
    // 連鎖した onScroll を 1 フレーム分だけ無視してループを防ぐ
    window.requestAnimationFrame(() => {
      syncingRef.current = false
    })
  }

  const handleGridScroll = (): void => {
    syncScroll(gridScrollRef.current, ganttScrollRef.current)
  }
  const handleGanttScroll = (): void => {
    syncScroll(ganttScrollRef.current, gridScrollRef.current)
  }

  // --- 編集ハンドラ ---
  const handleAdd = (): void => {
    const task = newTask(spec)
    const mode: AddMode = selectedId ? 'sibling-after' : 'root-append'
    dispatch({ type: 'addTask', task, mode, targetId: selectedId ?? undefined })
    setSelectedId(task.id)
  }

  const handleAddChild = (): void => {
    if (!selectedId) return
    const task = newTask(spec)
    dispatch({ type: 'addTask', task, mode: 'child', targetId: selectedId })
    setSelectedId(task.id)
  }

  const handleRemove = (): void => {
    if (!selectedId) return
    dispatch({ type: 'removeTask', id: selectedId })
    setSelectedId(null)
  }

  const handleIndent = (): void => {
    if (selectedId) dispatch({ type: 'indentTask', id: selectedId })
  }
  const handleOutdent = (): void => {
    if (selectedId) dispatch({ type: 'outdentTask', id: selectedId })
  }
  const handleMove = (direction: 'up' | 'down'): void => {
    if (selectedId) dispatch({ type: 'moveTask', id: selectedId, direction })
  }

  const handleToggleCollapse = (id: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleUpdate = (id: string, changes: Partial<TaskFields>): void => {
    dispatch({ type: 'updateTask', id, changes })
  }

  return (
    <div className="app">
      <Toolbar
        title={spec.info?.title ?? ''}
        selectedId={selectedId}
        onTitleChange={(title) => dispatch({ type: 'setInfoTitle', title })}
        onAdd={handleAdd}
        onAddChild={handleAddChild}
        onRemove={handleRemove}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onMoveUp={() => handleMove('up')}
        onMoveDown={() => handleMove('down')}
      />

      {error !== null ? (
        <div className="app-error" role="alert">
          スケジュールを計算できませんでした: {error}
        </div>
      ) : null}

      <div className="app-body">
        <TaskGrid
          visibleRows={visibleRows}
          allTasks={allTasks}
          selectedId={selectedId}
          scrollRef={gridScrollRef}
          onScroll={handleGridScroll}
          onSelect={setSelectedId}
          onToggleCollapse={handleToggleCollapse}
          onUpdate={handleUpdate}
        />
        <GanttChart
          layout={layout}
          selectedId={selectedId}
          scrollRef={ganttScrollRef}
          onScroll={handleGanttScroll}
          onSelectBar={setSelectedId}
        />
      </div>
    </div>
  )
}

export default App
