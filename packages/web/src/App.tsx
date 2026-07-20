/**
 * GUI エディタのルート。spec(undo/redo 履歴の present)・選択・折りたたみ・
 * ビューモード(ガント編集 / YAML / WBS 表)などの状態を束ね、spec から
 * スケジュール・ガントレイアウトを useMemo で派生させて各ビューに渡す。
 * dispatch すると自動的に再スケジュール・再レイアウト・再描画される
 * (編集のリアルタイム反映)。読み込んだ YAML のコメント・キー順は baseDoc に
 * 保持し、保存時の忠実性(fidelity)に使う。
 */
import './App.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { DragEvent } from 'react'
import sampleSource from '../../../examples/ecommerce.taskspec.yaml?raw'
import Toolbar from './components/Toolbar'
import type { ViewMode } from './components/Toolbar'
import TaskGrid from './components/TaskGrid'
import GanttChart from './components/GanttChart'
import type { DependencyRef } from './components/GanttChart'
import PaneSeparator from './components/PaneSeparator'
import YamlView from './components/YamlView'
import WbsTable from './components/WbsTable'
import TaskDialog from './components/TaskDialog'
import AboutDialog from './components/AboutDialog'
import LoadErrorNotice from './components/LoadError'
import type { LoadError } from './components/LoadError'
import {
  DAY_WIDTH,
  GANTT_DAY_OVERSCAN,
  GRID_WIDTH,
  HEADER_HEIGHT,
  MONTH_BAND_HEIGHT,
  ROW_HEIGHT,
} from './components/constants'
import {
  clampGridWidth,
  maxGridWidth,
  parseStoredGridWidth,
} from './components/paneWidth'
import { canAddDependency, editorReducer, newTask } from '@taskaror/core/editor'
import type {
  AddMode,
  DropPosition,
  EditorAction,
  TaskFields,
} from '@taskaror/core/editor'
import {
  canRedo,
  canUndo,
  initHistory,
  withHistory,
} from '@taskaror/core/history'
import { flattenTasks, serializeTaskSpec } from '@taskaror/core/taskspec'
import { parseTaskSpecDocument } from '@taskaror/core/fidelity'
import type { Document } from '@taskaror/core/fidelity'
import {
  emptyTaskSpec,
  ganttImageFileName,
  taskSpecFileName,
} from '@taskaror/core/file'
import { validateTaskSpec } from '@taskaror/core/validate'
import { scheduleTasks } from '@taskaror/core/schedule'
import type { ScheduledTask } from '@taskaror/core/schedule'
import {
  computeDayWindow,
  computeGanttLayout,
  filterCompleted,
  flattenScheduled,
  nextSelectionAfterRemoval,
} from '@taskaror/core/gantt'
import type { DayWindow, GanttLayout, GanttRow } from '@taskaror/core/gantt'
import { renderGanttSvg } from '@taskaror/core/ganttSvg'
import { computeCriticalPath } from '@taskaror/core/critical'
import { formatDate, today as localToday } from '@taskaror/core/date'
import type { Task, TaskSpec } from '@taskaror/core/types/taskspec'

interface Derived {
  visibleRows: GanttRow[]
  layout: GanttLayout
  /** スケジュール導出結果のツリー(WBS 表の開始・終了に使う) */
  scheduled: ScheduledTask[]
}

const EMPTY_LAYOUT: GanttLayout = computeGanttLayout([], {
  dayWidth: DAY_WIDTH,
  rowHeight: ROW_HEIGHT,
})

/** localStorage の保存キー(旧: JSON 形式。後方互換のため読み込みのみ対応) */
const STORAGE_KEY = 'taskaror:spec'
/** localStorage の保存キー(新: YAML テキスト。コメント等の忠実性を保つ) */
const STORAGE_KEY_YAML = 'taskaror:spec.yaml'

/** localStorage から文字列を読む(失敗しても null を返す) */
function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * localStorage から編集内容を復元する(ブラウザ専用)。
 * 新形式(YAML テキスト)を優先し、コメント等を保持したベース Document も復元する。
 * 旧形式(JSON)からは spec のみ移行する(忠実性のベースは持てないので doc は null)。
 * 未保存・壊れている・検証に通らない場合は null を返し、サンプルにフォールバックさせる。
 */
function loadStoredSpec(): { spec: TaskSpec; doc: Document | null } | null {
  // 新形式: YAML テキスト(ベース Document も一緒に復元してコメント等を保つ)
  const yamlText = readStorage(STORAGE_KEY_YAML)
  if (yamlText !== null) {
    try {
      const parsed = parseTaskSpecDocument(yamlText)
      if (validateTaskSpec(parsed.spec).length === 0) return parsed
    } catch {
      // 壊れていれば旧形式・サンプルへフォールバックする
    }
  }
  // 旧形式: JSON(コメント等のベースは持てないので plain 扱い)
  const json = readStorage(STORAGE_KEY)
  if (json !== null) {
    try {
      const data: unknown = JSON.parse(json)
      if (validateTaskSpec(data).length === 0) {
        return { spec: data as TaskSpec, doc: null }
      }
    } catch {
      // ignore
    }
  }
  return null
}

/**
 * 編集内容を localStorage に YAML テキストで保存する(ブラウザ専用。失敗しても無視する)。
 * baseDoc があれば忠実性を効かせて serialize するので、リロード後もコメント等が残る。
 */
function saveStoredSpec(spec: TaskSpec, baseDoc: Document | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_YAML, serializeTaskSpec(spec, baseDoc))
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** ビューモードの保存キー */
const VIEW_MODE_KEY = 'taskaror:viewMode'

/** 妥当なビューモードか(localStorage 由来の値の検証に使う) */
function isViewMode(value: unknown): value is ViewMode {
  return value === 'gantt' || value === 'yaml' || value === 'wbs'
}

/** localStorage から保存済みのビューモードを復元する(未保存・不正なら 'gantt') */
function loadViewMode(): ViewMode {
  if (typeof localStorage === 'undefined') return 'gantt'
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY)
    return isViewMode(raw) ? raw : 'gantt'
  } catch {
    return 'gantt'
  }
}

/** ビューモードを localStorage に保存する(ブラウザ専用。失敗しても無視する) */
function saveViewMode(mode: ViewMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** グリッド幅の保存キー */
const GRID_WIDTH_KEY = 'taskaror:gridWidth'

/**
 * localStorage から保存済みのグリッド幅を復元する(ブラウザ専用)。
 * 未保存・壊れている・範囲外なら既定幅にフォールバックする。SSR では既定幅。
 */
function loadStoredGridWidth(): number {
  if (typeof window === 'undefined') return GRID_WIDTH
  const max = maxGridWidth(window.innerWidth)
  let raw: string | null
  try {
    raw = localStorage.getItem(GRID_WIDTH_KEY)
  } catch {
    return clampGridWidth(GRID_WIDTH, max)
  }
  return parseStoredGridWidth(raw, max, GRID_WIDTH)
}

/** グリッド幅を localStorage に保存する(ブラウザ専用。失敗しても無視する) */
function saveStoredGridWidth(width: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GRID_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** クリティカルパス表示の保存キー */
const CRITICAL_PATH_KEY = 'taskaror:criticalPath'

/** クリティカルパス表示の ON/OFF を復元する(未保存・不正なら OFF) */
function loadShowCriticalPath(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(CRITICAL_PATH_KEY) === '1'
  } catch {
    return false
  }
}

/** クリティカルパス表示の ON/OFF を保存する(ブラウザ専用。失敗しても無視する) */
function saveShowCriticalPath(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CRITICAL_PATH_KEY, on ? '1' : '0')
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** 完了タスク非表示の保存キー */
const HIDE_COMPLETED_KEY = 'taskaror:hideCompleted'

/** 完了タスク非表示の ON/OFF を復元する(未保存・不正なら OFF) */
function loadHideCompleted(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(HIDE_COMPLETED_KEY) === '1'
  } catch {
    return false
  }
}

/** 完了タスク非表示の ON/OFF を保存する(ブラウザ専用。失敗しても無視する) */
function saveHideCompleted(on: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(HIDE_COMPLETED_KEY, on ? '1' : '0')
  } catch {
    // 容量超過やプライベートモードでの失敗は無視する
  }
}

/** 次のローカル深夜(0 時)までのミリ秒。日跨ぎで「今日」を更新するタイマーに使う */
function msUntilNextLocalMidnight(): number {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}

/** Blob をファイルとしてダウンロードさせる(ブラウザ専用) */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** テキストをファイルとしてダウンロードさせる(ブラウザ専用) */
function downloadText(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: 'text/yaml;charset=utf-8' }), fileName)
}

/**
 * SVG 文字列を PNG の Blob に変換する(canvas 経由。ブラウザ専用)。
 * devicePixelRatio で高解像度化する(メモリ過大を避けるため上限 2 倍)。
 * 画像サイズは SVG が持つ width/height から取得する。
 */
function ganttSvgToPngBlob(svgString: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('ブラウザ環境が必要です'))
      return
    }
    const scale = Math.min(
      typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
      2,
    )
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const url = URL.createObjectURL(svgBlob)
    const image = new Image()
    image.onload = (): void => {
      const w = image.naturalWidth || image.width
      const h = image.naturalHeight || image.height
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext('2d')
        if (ctx === null)
          throw new Error('canvas 2D コンテキストを取得できません')
        ctx.scale(scale, scale)
        ctx.drawImage(image, 0, 0)
        canvas.toBlob((out) => {
          URL.revokeObjectURL(url)
          if (out) resolve(out)
          else reject(new Error('PNG の生成に失敗しました'))
        }, 'image/png')
      } catch (thrown) {
        URL.revokeObjectURL(url)
        reject(thrown instanceof Error ? thrown : new Error(String(thrown)))
      }
    }
    image.onerror = (): void => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG の画像化に失敗しました'))
    }
    image.src = url
  })
}

/** 破棄確認を出すべき「編集中の内容」があるか */
function hasEditContent(spec: TaskSpec): boolean {
  return spec.tasks.length > 0 || (spec.info?.title ?? '') !== ''
}

/**
 * 連続した編集を 1 履歴にまとめる判定。
 * setInfoTitle はキーストロークごとに action が飛ぶため、直前も setInfoTitle なら
 * まとめて 1 回で undo できるようにする。replaceSpec(新規・読み込み・復元)は
 * まとめ対象にせず、個別に undo できるようにする。
 */
function shouldCoalesceEdit(prev: EditorAction, next: EditorAction): boolean {
  return prev.type === 'setInfoTitle' && next.type === 'setInfoTitle'
}

/** 履歴(undo / redo)対応にラップしたエディタ reducer */
const historyReducer = withHistory(editorReducer, {
  shouldCoalesce: shouldCoalesceEdit,
})

/**
 * フォーカス中の要素が入力欄などの編集可能要素か。
 * true の間はブラウザ既定の undo を優先し、アプリの undo ショートカットは動かさない。
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * 初期状態(編集用 spec と忠実性のベース Document)を求める。
 * localStorage に妥当な編集内容があればそれを、なければサンプルを使う。
 */
function computeInitial(): { spec: TaskSpec; doc: Document | null } {
  const stored = loadStoredSpec()
  if (stored !== null) return stored
  return parseTaskSpecDocument(sampleSource)
}

function App() {
  // 初期 spec とベース Document を一度だけ求める(lazy initializer)
  const [initial] = useState(computeInitial)
  const [history, dispatch] = useReducer(historyReducer, undefined, () =>
    initHistory<TaskSpec, EditorAction>(initial.spec),
  )
  // 忠実性のベース Document(読み込んだ YAML のコメント・キー順・引用符スタイルの保持元)。
  // GUI 編集では変わらず、読み込み/YAML ビュー適用時に差し替え、新規作成時に null にする。
  // YAML ビューの描画に render 時に参照するため ref ではなく state で持つ。
  const [baseDoc, setBaseDoc] = useState<Document | null>(initial.doc)
  // present を従来の spec として扱う(編集・派生・保存はすべて present 基準)
  const spec = history.present
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 選択中の依存線(先行→後続の 1 本)。タスク選択(selectedId)とは相互排他にする。
  // グローバルの Delete が「選択タスク削除」と競合するため、依存線選択も App にリフトして
  // 一元管理し、削除の優先順位(依存線 > タスク)をここで調停する。
  const [selectedDependency, setSelectedDependency] =
    useState<DependencyRef | null>(null)
  // 編集ダイアログの対象タスク id(null なら閉じている)
  const [dialogTaskId, setDialogTaskId] = useState<string | null>(null)
  // [ヘルプ] → [taskaror について] ダイアログの開閉
  const [aboutOpen, setAboutOpen] = useState(false)
  // ファイル読み込みの失敗内容(パース or 検証)。成功時・閉じたときは null
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  // 本文のビューモード(ガント編集 / YAML / WBS 表)
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  // クリティカルパスの強調表示 ON/OFF(ガントのバー・矢印に反映)
  const [showCriticalPath, setShowCriticalPath] =
    useState<boolean>(loadShowCriticalPath)
  // 完了タスク(progress === 100)を表示から隠すビューフィルタ(spec は変えない)
  const [hideCompleted, setHideCompleted] = useState<boolean>(loadHideCompleted)
  // 「今日」('YYYY-MM-DD')。今日線・スケジュールの基準日。日付をまたぐと更新する
  const [today, setToday] = useState<string>(() => formatDate(localToday()))

  // spec が変わるたびに localStorage へ保存する(リロードでの作業消失を防ぐ)。
  // ベース Document を使って忠実性を効かせるので、リロード後もコメント等が残る。
  // baseDoc は読み込み/適用/新規で spec と一緒に変わるため、両方を依存に入れる。
  useEffect(() => {
    saveStoredSpec(spec, baseDoc)
  }, [spec, baseDoc])

  // ビューモードを localStorage に保存する(次回起動時に同じビューで開く)
  useEffect(() => {
    saveViewMode(viewMode)
  }, [viewMode])

  // クリティカルパス表示の ON/OFF を localStorage に保存する
  useEffect(() => {
    saveShowCriticalPath(showCriticalPath)
  }, [showCriticalPath])

  // 完了タスク非表示の ON/OFF を localStorage に保存する
  useEffect(() => {
    saveHideCompleted(hideCompleted)
  }, [hideCompleted])

  // 日付をまたいだら「今日」を更新し、今日線・スケジュールを追従させる。
  // 次のローカル深夜に setTimeout を張り、発火したら today を更新して次の深夜を張り直す。
  // スリープ復帰やタブ復帰でタイマーがずれることがあるため、focus / visibilitychange でも
  // 今日を再評価する。setToday は関数更新なので、依存配列を空にしても値は陳腐化しない。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = (): void => {
      setToday((prev) => {
        const now = formatDate(localToday())
        return prev === now ? prev : now
      })
    }
    const scheduleNext = (): void => {
      // 深夜を確実に跨ぐよう少し余裕を足す
      timer = setTimeout(() => {
        sync()
        scheduleNext()
      }, msUntilNextLocalMidnight() + 1000)
    }
    scheduleNext()
    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') sync()
    }
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // キーボードショートカット: Cmd/Ctrl+Z で undo、Cmd/Ctrl+Shift+Z・Ctrl+Y で redo。
  // 入力欄など編集要素にフォーカスがある間はブラウザ既定の undo を邪魔しない。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (isEditableTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        dispatch({ type: 'undo' })
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        dispatch({ type: 'redo' })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 依存編集の選択肢に使う全タスク(深さ付き)
  const allTasks = useMemo(() => flattenTasks(spec.tasks), [spec])

  // 編集ダイアログの対象タスク(spec 上の実体)。削除等で消えたら null
  const dialogTask =
    dialogTaskId !== null
      ? (allTasks.find((flat) => flat.task.id === dialogTaskId)?.task ?? null)
      : null

  // spec / collapsedIds からスケジュール・ガントレイアウトを派生させる。
  // 不正な estimate 等で scheduleTasks が throw しうるので try/catch で囲む。
  const computation = useMemo<
    { ok: true; derived: Derived } | { ok: false; error: string }
  >(() => {
    try {
      const scheduled = scheduleTasks(spec, { today })
      // 完了タスク非表示は「ガント表示のフィルタ」。scheduled 本体(WBS 表・
      // クリティカルパス算出に使う)は全タスクのまま保ち、表示行だけを絞る。
      const displayRoots = hideCompleted
        ? filterCompleted(scheduled)
        : scheduled
      const rows = flattenScheduled(displayRoots, collapsedIds)
      const layout = computeGanttLayout(rows, {
        dayWidth: DAY_WIDTH,
        rowHeight: ROW_HEIGHT,
        today,
      })
      return { ok: true, derived: { visibleRows: rows, layout, scheduled } }
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      return { ok: false, error: message }
    }
  }, [spec, collapsedIds, today, hideCompleted])

  // 直近の正常な派生結果を保持し、計算失敗時はこれを表示し続ける(アプリを落とさない)。
  // 正常に計算できたらレンダー中に取り込む(収束するので追加のレンダーは 1 回のみ)。
  const [lastGood, setLastGood] = useState<Derived>({
    visibleRows: [],
    layout: EMPTY_LAYOUT,
    scheduled: [],
  })
  if (computation.ok && computation.derived !== lastGood) {
    setLastGood(computation.derived)
  }

  const derived = computation.ok ? computation.derived : lastGood
  const { visibleRows, layout } = derived
  const error = computation.ok ? null : computation.error

  // クリティカルパス(slack 0 のタスク鎖)の id 集合。スケジュール導出結果から算出する。
  // scheduled は spec / today が変わると作り直されるので、その参照変化で再計算される。
  const criticalIds = useMemo(
    () => computeCriticalPath(derived.scheduled),
    [derived.scheduled],
  )

  // --- ペイン幅(左グリッド)のドラッグリサイズ ---
  // 縦スクロールは 1 つの共有コンテナ(.editor-scroll)に集約したので、
  // 左右で scrollTop を同期する必要はなくなった(行ずれが原理的に起きない)。
  const [gridWidth, setGridWidth] = useState<number>(() =>
    loadStoredGridWidth(),
  )
  // セパレータが幅の基準(左端座標)にするコンテナ
  const appBodyRef = useRef<HTMLDivElement>(null)

  // ウィンドウが縮んで上限が下がったら、はみ出さないよう現在の幅を丸め直す
  useEffect(() => {
    const handleResize = (): void => {
      setGridWidth((prev) =>
        clampGridWidth(prev, maxGridWidth(window.innerWidth)),
      )
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  /** ドラッグ終了・キー操作で確定した幅を反映しつつ永続化する */
  const commitGridWidth = (width: number): void => {
    setGridWidth(width)
    saveStoredGridWidth(width)
  }

  // --- ガント日カラムの仮想化(可視範囲だけ描く) ---
  // 共有スクロール容器(.editor-scroll)の scrollLeft と可視幅を追跡し、frozen な
  // グリッド幅を差し引いたガント領域の可視 X 範囲を日インデックス窓に変換する。
  // これで総期間が長くても、描く日カラムを viewport 相当に抑えられる。
  const editorScrollRef = useRef<HTMLDivElement>(null)
  const [scrollMetrics, setScrollMetrics] = useState<{
    scrollLeft: number
    clientWidth: number
  }>(() => ({
    scrollLeft: 0,
    // 初回レンダーでも概ね正しい窓を出せるよう、ウィンドウ幅で近似する(SSR は 0)。
    clientWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
  }))

  // スクロール容器の scrollLeft / clientWidth を onScroll + ResizeObserver で追跡する。
  // 更新は rAF スロットルし、値が変わったときだけ state を更新して再描画を抑える。
  useEffect(() => {
    const element = editorScrollRef.current
    if (element === null) return
    let frame = 0
    const measure = (): void => {
      frame = 0
      setScrollMetrics((prev) =>
        prev.scrollLeft === element.scrollLeft &&
        prev.clientWidth === element.clientWidth
          ? prev
          : {
              scrollLeft: element.scrollLeft,
              clientWidth: element.clientWidth,
            },
      )
    }
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }
    measure() // 初期計測(マウント直後・ビュー切り替え直後)
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [viewMode])

  // 可視 X 範囲 → 日インデックス窓(オーバースキャン付き)。clientWidth 未計測(0)の
  // 間はフル描画にフォールバックする(SSR など)。
  const dayWindow = useMemo<DayWindow | null>(() => {
    if (scrollMetrics.clientWidth <= 0) return null
    const ganttViewport = Math.max(0, scrollMetrics.clientWidth - gridWidth)
    const xStart = scrollMetrics.scrollLeft
    const xEnd = scrollMetrics.scrollLeft + ganttViewport
    return computeDayWindow(
      layout.days.length,
      layout.dayWidth,
      xStart,
      xEnd,
      GANTT_DAY_OVERSCAN,
    )
  }, [scrollMetrics, gridWidth, layout.days.length, layout.dayWidth])

  // --- 選択(タスク ⇔ 依存線の相互排他) ---
  // タスク(行・バー)を選択したら依存線選択を解除し、依存線を選択したらタスク選択を
  // 解除する。どちらのセッターも identity 安定なので useCallback の依存は空でよい。
  const selectTask = useCallback((id: string | null): void => {
    setSelectedId(id)
    setSelectedDependency(null)
  }, [])

  /** 依存線(矢印)クリックでの選択。タスク選択とは相互排他にする */
  const handleSelectDependency = useCallback((dep: DependencyRef): void => {
    setSelectedDependency(dep)
    setSelectedId(null)
  }, [])

  // --- 編集ハンドラ ---
  // handleAdd / handleRemove はキーボードショートカット(Insert / Delete)の
  // useEffect 依存に入るため、useCallback で安定化して不要な再購読を避ける。
  const handleAdd = useCallback((): void => {
    const task = newTask(spec)
    const mode: AddMode = selectedId ? 'sibling-after' : 'root-append'
    dispatch({ type: 'addTask', task, mode, targetId: selectedId ?? undefined })
    selectTask(task.id)
  }, [spec, selectedId, selectTask])

  /**
   * ルート末尾に空タスクを作成して選択し、作成したタスクを返す。
   * グリッドの空行クリック(スプレッドシート風の新規作成)から呼ばれ、
   * 呼び出し側は返り値を使って名称セルの編集をすぐ開始できる。
   */
  const handleCreateTask = (): Task => {
    const task = newTask(spec)
    dispatch({ type: 'addTask', task, mode: 'root-append' })
    selectTask(task.id)
    return task
  }

  const handleRemove = useCallback((): void => {
    if (!selectedId) return
    // 削除でフォーカス(選択)が消えないよう、削除前の表示行から移動先を決める
    const nextSelected = nextSelectionAfterRemoval(visibleRows, selectedId)
    dispatch({ type: 'removeTask', id: selectedId })
    selectTask(nextSelected)
  }, [selectedId, visibleRows, selectTask])

  const handleIndent = (): void => {
    if (selectedId) dispatch({ type: 'indentTask', id: selectedId })
  }
  const handleOutdent = (): void => {
    if (selectedId) dispatch({ type: 'outdentTask', id: selectedId })
  }
  const handleMove = (direction: 'up' | 'down'): void => {
    if (selectedId) dispatch({ type: 'moveTask', id: selectedId, direction })
  }

  /** ドラッグ&ドロップでのタスク移動。移動後も当該タスクを選択状態に保つ */
  const handleMoveTask = (
    id: string,
    targetId: string,
    position: DropPosition,
  ): void => {
    dispatch({ type: 'moveTaskTo', id, targetId, position })
    selectTask(id)
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

  /**
   * 編集ダイアログの確定。newId があれば id 変更(depends 参照の一括置換)も含めて
   * 1 アクションで適用する(1 履歴にまとまる)。id を参照するビュー状態
   * (選択・折りたたみ)も新 id へ追従させる。
   */
  const handleDialogSubmit = (
    id: string,
    changes: Partial<TaskFields>,
    newId?: string,
  ): void => {
    dispatch({ type: 'updateTask', id, changes, newId })
    if (newId !== undefined) {
      if (selectedId === id) setSelectedId(newId)
      setCollapsedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        next.add(newId)
        return next
      })
    }
    setDialogTaskId(null)
  }

  /** ダブルクリックで編集ダイアログを開く(対象を選択もする) */
  const handleOpenDialog = (id: string): void => {
    selectTask(id)
    setDialogTaskId(id)
  }

  // 依存線ドラッグの可否判定(先行 pred → 後続 succ。succ.depends に pred を足す)
  const canLinkDependency = (predId: string, succId: string): boolean =>
    canAddDependency(spec.tasks, predId, succId)

  /** 依存線ドラッグの確定。succ.depends に pred を足す(妥当な場合のみ) */
  const handleLinkDependency = (predId: string, succId: string): void => {
    if (!canAddDependency(spec.tasks, predId, succId)) return
    const succ = allTasks.find((flat) => flat.task.id === succId)?.task
    const depends = [...(succ?.depends ?? []), predId]
    dispatch({ type: 'updateTask', id: succId, changes: { depends } })
    selectTask(succId)
  }

  /**
   * 依存線の削除。後続タスク(succ)の depends から先行 id(pred)を外す。
   * depends が空になれば updateTask 側でキー自体が消える(applyFieldChanges)。
   * 削除後は依存線選択を解除する(参照先が消えるため)。
   */
  const handleUnlinkDependency = useCallback(
    (predId: string, succId: string): void => {
      const succ = allTasks.find((flat) => flat.task.id === succId)?.task
      if (succ !== undefined) {
        const depends = (succ.depends ?? []).filter((id) => id !== predId)
        dispatch({ type: 'updateTask', id: succId, changes: { depends } })
      }
      setSelectedDependency(null)
    },
    [allTasks],
  )

  // タスク操作のショートカット。undo/redo とは分けて張る。
  //  - 修飾なし: Insert=追加 / Delete=削除
  //  - Ctrl/Cmd+矢印: 上下移動(↑↓)・インデント(→)・アウトデント(←)
  // 入力欄・ダイアログ表示中・ガント編集ビュー以外では無効にする。矢印系は選択タスクに
  // 作用するので、素の矢印(行フォーカス移動・バーの開始日シフト)とは修飾キーで区別する。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) return
      if (dialogTaskId !== null || viewMode !== 'gantt') return
      const mod = event.ctrlKey || event.metaKey
      if (!mod) {
        if (event.key === 'Insert') {
          event.preventDefault()
          handleAdd()
        } else if (event.key === 'Delete') {
          // 依存線選択を優先し、なければ選択タスクを削除する(両者は相互排他)
          if (selectedDependency !== null) {
            event.preventDefault()
            handleUnlinkDependency(
              selectedDependency.predId,
              selectedDependency.succId,
            )
          } else if (selectedId !== null) {
            event.preventDefault()
            handleRemove()
          }
        }
        return
      }
      // Ctrl/Cmd+矢印は選択タスクに作用する(未選択なら何もしない)
      if (selectedId === null) return
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          dispatch({ type: 'moveTask', id: selectedId, direction: 'up' })
          break
        case 'ArrowDown':
          event.preventDefault()
          dispatch({ type: 'moveTask', id: selectedId, direction: 'down' })
          break
        case 'ArrowRight':
          event.preventDefault()
          dispatch({ type: 'indentTask', id: selectedId })
          break
        case 'ArrowLeft':
          event.preventDefault()
          dispatch({ type: 'outdentTask', id: selectedId })
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    viewMode,
    dialogTaskId,
    selectedId,
    selectedDependency,
    handleAdd,
    handleRemove,
    handleUnlinkDependency,
  ])

  // --- ファイル入出力 ---

  const handleNew = (): void => {
    // 誤操作防止:編集中の内容があるときだけ確認する
    if (
      hasEditContent(spec) &&
      !window.confirm('編集中の内容を破棄して新規作成しますか?')
    ) {
      return
    }
    // 新規作成では忠実性のベースを捨てる(以後は plain stringify)
    setBaseDoc(null)
    dispatch({ type: 'replaceSpec', spec: emptyTaskSpec() })
    selectTask(null)
    setLoadError(null)
  }

  const handleSave = (): void => {
    // ベース Document を使って未変更部分のコメント・キー順・引用符スタイルを保つ
    downloadText(serializeTaskSpec(spec, baseDoc), taskSpecFileName(spec))
  }

  // --- エクスポート(SVG / PNG) ---
  // 生成/ダウンロード失敗をユーザーに知らせるための一時メッセージ(数秒で自動的に消す)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    if (exportError === null) return
    const timer = setTimeout(() => setExportError(null), 6000)
    return () => clearTimeout(timer)
  }, [exportError])

  // エクスポートは可視窓(仮想化)に依存せず、全期間(layout の全 days)を出力する。
  const buildGanttSvg = (): string =>
    renderGanttSvg(
      layout,
      visibleRows.map((row) => ({
        id: row.scheduled.task.id,
        depth: row.depth,
      })),
      { headerHeight: HEADER_HEIGHT, monthBandHeight: MONTH_BAND_HEIGHT },
    )

  const handleExportSvg = (): void => {
    try {
      const svg = buildGanttSvg()
      downloadBlob(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
        ganttImageFileName(spec, 'svg'),
      )
    } catch {
      setExportError('SVG の書き出しに失敗しました')
    }
  }

  const handleExportPng = (): void => {
    let svg: string
    try {
      svg = buildGanttSvg()
    } catch {
      setExportError('PNG の書き出しに失敗しました')
      return
    }
    ganttSvgToPngBlob(svg)
      .then((blob) => downloadBlob(blob, ganttImageFileName(spec, 'png')))
      .catch(() => setExportError('PNG の書き出しに失敗しました'))
  }

  /** 読み込んだテキストをパース・検証し、問題なければ spec を置き換える */
  const loadFromText = (text: string): void => {
    let parsed: { spec: TaskSpec; doc: Document }
    try {
      // 編集用 spec と、忠実性のベース Document(コメント等を保持)の両方を得る
      parsed = parseTaskSpecDocument(text)
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      setLoadError({ kind: 'parse', message })
      return
    }
    const issues = validateTaskSpec(parsed.spec)
    if (issues.length > 0) {
      setLoadError({ kind: 'validation', issues })
      return
    }
    setBaseDoc(parsed.doc)
    dispatch({ type: 'replaceSpec', spec: parsed.spec })
    selectTask(null)
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
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showCriticalPath={showCriticalPath}
        onToggleCriticalPath={() => setShowCriticalPath((on) => !on)}
        hideCompleted={hideCompleted}
        onToggleHideCompleted={() => setHideCompleted((on) => !on)}
        onExportSvg={handleExportSvg}
        onExportPng={handleExportPng}
        onTitleChange={(title) => dispatch({ type: 'setInfoTitle', title })}
        onNew={handleNew}
        onSave={handleSave}
        onOpenFile={loadFromFile}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={() => dispatch({ type: 'undo' })}
        onRedo={() => dispatch({ type: 'redo' })}
        onAdd={handleAdd}
        onRemove={handleRemove}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onMoveUp={() => handleMove('up')}
        onMoveDown={() => handleMove('down')}
        onAbout={() => setAboutOpen(true)}
      />

      {loadError !== null ? (
        <LoadErrorNotice error={loadError} onClose={() => setLoadError(null)} />
      ) : null}

      {error !== null ? (
        <div className="app-error" role="alert">
          スケジュールを計算できませんでした: {error}
        </div>
      ) : null}

      {exportError !== null ? (
        <div className="app-error" role="alert">
          {exportError}
        </div>
      ) : null}

      {viewMode === 'gantt' ? (
        <div className="app-body" ref={appBodyRef}>
          {/* 唯一の縦横スクロール容器。左グリッドと右ガントを同じ容器に入れ、
              グリッドは横スクロール時に左端へ固定(sticky)することで行を常に一致させる */}
          <div className="editor-scroll" ref={editorScrollRef}>
            <TaskGrid
              visibleRows={visibleRows}
              allTasks={allTasks}
              selectedId={selectedId}
              gridWidth={gridWidth}
              onSelect={selectTask}
              onToggleCollapse={handleToggleCollapse}
              onUpdate={handleUpdate}
              onMove={handleMoveTask}
              onCreateTask={handleCreateTask}
              onOpenDialog={handleOpenDialog}
            />
            <GanttChart
              layout={layout}
              dayWindow={dayWindow}
              selectedId={selectedId}
              selectedDependency={selectedDependency}
              criticalIds={criticalIds}
              showCritical={showCriticalPath}
              onSelectBar={selectTask}
              onSelectDependency={handleSelectDependency}
              onUpdateTask={handleUpdate}
              onLinkDependency={handleLinkDependency}
              canLinkDependency={canLinkDependency}
            />
          </div>
          <PaneSeparator
            gridWidth={gridWidth}
            containerRef={appBodyRef}
            onResize={setGridWidth}
            onCommitWidth={commitGridWidth}
          />
        </div>
      ) : viewMode === 'yaml' ? (
        <YamlView
          spec={spec}
          baseDoc={baseDoc}
          onApply={(next, doc) => {
            // 適用したユーザー入力テキストを新しいベース Document にする
            // (以後の GUI 編集はこのテキスト基準で忠実性 reconcile される)
            setBaseDoc(doc)
            dispatch({ type: 'replaceSpec', spec: next })
            selectTask(null)
          }}
        />
      ) : (
        <WbsTable spec={spec} scheduled={derived.scheduled} />
      )}

      {dragActive ? (
        <div className="app-dropzone" aria-hidden="true">
          <div className="app-dropzone-label">
            .taskspec.yaml をドロップして読み込み
          </div>
        </div>
      ) : null}

      {dialogTask !== null ? (
        <TaskDialog
          task={dialogTask}
          allTasks={allTasks}
          onClose={() => setDialogTaskId(null)}
          onSubmit={(changes, newId) =>
            handleDialogSubmit(dialogTask.id, changes, newId)
          }
        />
      ) : null}

      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </div>
  )
}

export default App
