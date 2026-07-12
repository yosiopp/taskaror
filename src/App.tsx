/**
 * ガントエディタのルート。状態(spec / collapsedIds / selectedId)を束ね、
 * spec からスケジュール・ガントレイアウトを派生させて左グリッドと右ガントに渡す。
 * すべて spec / collapsedIds からの useMemo 派生なので、dispatch すると
 * 自動的に再スケジュール・再レイアウト・再描画される(編集のリアルタイム反映)。
 */
import './App.css'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import sampleSource from '../examples/ecommerce.taskspec.yaml?raw'
import Toolbar from './components/Toolbar'
import TaskGrid from './components/TaskGrid'
import GanttChart from './components/GanttChart'
import LoadErrorNotice from './components/LoadError'
import type { LoadError } from './components/LoadError'
import { DAY_WIDTH, ROW_HEIGHT } from './components/constants'
import { editorReducer, newTask } from './lib/editor'
import type { AddMode, TaskFields } from './lib/editor'
import { flattenTasks, parseTaskSpec, serializeTaskSpec } from './lib/taskspec'
import { emptyTaskSpec, taskSpecFileName } from './lib/file'
import { validateTaskSpec } from './lib/validate'
import { scheduleTasks } from './lib/schedule'
import { computeGanttLayout, flattenScheduled } from './lib/gantt'
import type { GanttLayout, GanttRow } from './lib/gantt'
import type { TaskSpec } from './types/taskspec'

interface Derived {
  visibleRows: GanttRow[]
  layout: GanttLayout
}

const EMPTY_LAYOUT: GanttLayout = computeGanttLayout([], {
  dayWidth: DAY_WIDTH,
  rowHeight: ROW_HEIGHT,
})

/** localStorage の保存キー */
const STORAGE_KEY = 'taskaror:spec'

/**
 * localStorage から編集内容を復元する(ブラウザ専用)。
 * 未保存・壊れている・検証に通らない場合は null を返し、サンプルにフォールバックさせる。
 */
function loadStoredSpec(): TaskSpec | null {
  if (typeof localStorage === 'undefined') return null
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (validateTaskSpec(data).length > 0) return null
  return data as TaskSpec
}

/** 編集内容を localStorage に保存する(ブラウザ専用。失敗しても無視する) */
function saveStoredSpec(spec: TaskSpec): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spec))
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** テキストをファイルとしてダウンロードさせる(ブラウザ専用) */
function downloadText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** 破棄確認を出すべき「編集中の内容」があるか */
function hasEditContent(spec: TaskSpec): boolean {
  return spec.tasks.length > 0 || (spec.info?.title ?? '') !== ''
}

function App() {
  // localStorage に妥当な編集内容があればそれを、なければサンプルを初期状態にする
  const [spec, dispatch] = useReducer(
    editorReducer,
    undefined,
    () => loadStoredSpec() ?? parseTaskSpec(sampleSource),
  )
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // ファイル読み込みの失敗内容(パース or 検証)。成功時・閉じたときは null
  const [loadError, setLoadError] = useState<LoadError | null>(null)

  // spec が変わるたびに localStorage へ保存する(リロードでの作業消失を防ぐ)
  useEffect(() => {
    saveStoredSpec(spec)
  }, [spec])

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

  // --- ファイル入出力 ---

  const handleNew = (): void => {
    // 誤操作防止:編集中の内容があるときだけ確認する
    if (
      hasEditContent(spec) &&
      !window.confirm('編集中の内容を破棄して新規作成しますか?')
    ) {
      return
    }
    dispatch({ type: 'replaceSpec', spec: emptyTaskSpec() })
    setSelectedId(null)
    setLoadError(null)
  }

  const handleSave = (): void => {
    downloadText(serializeTaskSpec(spec), taskSpecFileName(spec))
  }

  /** 読み込んだテキストをパース・検証し、問題なければ spec を置き換える */
  const loadFromText = (text: string): void => {
    let parsed: TaskSpec
    try {
      parsed = parseTaskSpec(text)
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      setLoadError({ kind: 'parse', message })
      return
    }
    const issues = validateTaskSpec(parsed)
    if (issues.length > 0) {
      setLoadError({ kind: 'validation', issues })
      return
    }
    dispatch({ type: 'replaceSpec', spec: parsed })
    setSelectedId(null)
    setLoadError(null)
  }

  const loadFromFile = (file: File): void => {
    file
      .text()
      .then((text) => loadFromText(text))
      .catch(() => {
        setLoadError({
          kind: 'parse',
          message: 'ファイルの読み込みに失敗しました',
        })
      })
  }

  // --- ドラッグ&ドロップ(画面全体で受ける) ---
  // 子要素をまたぐたびに dragenter/dragleave が発火するため、深さを数えて
  // 全体から出たとき(0 になったとき)だけオーバーレイを閉じる。
  const dragDepth = useRef(0)
  const [dragActive, setDragActive] = useState(false)

  const isFileDrag = (event: DragEvent<HTMLDivElement>): boolean =>
    event.dataTransfer.types.includes('Files')

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragActive(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault() // drop を許可するために必要
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragActive(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!isFileDrag(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    const file = event.dataTransfer.files[0]
    if (file) loadFromFile(file)
  }

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toolbar
        title={spec.info?.title ?? ''}
        selectedId={selectedId}
        onTitleChange={(title) => dispatch({ type: 'setInfoTitle', title })}
        onNew={handleNew}
        onSave={handleSave}
        onOpenFile={loadFromFile}
        onAdd={handleAdd}
        onAddChild={handleAddChild}
        onRemove={handleRemove}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onMoveUp={() => handleMove('up')}
        onMoveDown={() => handleMove('down')}
      />

      {loadError !== null ? (
        <LoadErrorNotice error={loadError} onClose={() => setLoadError(null)} />
      ) : null}

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

      {dragActive ? (
        <div className="app-dropzone" aria-hidden="true">
          <div className="app-dropzone-label">
            .taskspec.yaml をドロップして読み込み
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
