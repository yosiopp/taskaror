/**
 * グローバルヘッダ(2 行構成)。
 * 1 行目: アプリ名 / プロジェクトタイトル / メニューバー([ファイル]・[編集]・[表示]・[ヘルプ])。
 * 2 行目: タスク操作のツールバー(Material Icons)。ガント編集ビューでのみ表示する。
 * ファイル・undo/redo・ビュー切替・クリティカルパスなどの操作はメニューに集約し、
 * ツールバーには重複させない。例外はフィルター:適用中かどうかを常に示すため、
 * ツールバー右端にもアイコンを置く([表示] → [フィルター] と同じダイアログを開く)。
 */
import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import MenuBar from './MenuBar'
import type { Menu } from './MenuBar'
import type { FilterSection } from './FilterDialog'
import { isColumnVisible, isDefaultColumnState } from './gridColumns'
import type { GridColumnKey, GridColumnState } from './gridColumns'
import { Icon } from './icons'
import type { IconName } from './icons'
import { DOCS_URL, REPOSITORY_URL } from '../appInfo'

/** 本文のビューモード(ガント編集 / YAML テキスト / WBS 表) */
export type ViewMode = 'gantt' | 'yaml' | 'wbs'

export interface ToolbarProps {
  /** プロジェクトタイトル(spec.info?.title) */
  title: string
  /** 選択中タスク id(未選択なら null) */
  selectedId: string | null
  /** 現在のビューモード */
  viewMode: ViewMode
  /** ビューモードの切り替え */
  onViewModeChange: (mode: ViewMode) => void
  /** クリティカルパスの強調表示が ON か */
  showCriticalPath: boolean
  /** クリティカルパス表示の ON/OFF を切り替える */
  onToggleCriticalPath: () => void
  /** 完了タスク(progress === 100)を非表示にしているか */
  hideCompleted: boolean
  /** 完了タスク非表示の ON/OFF を切り替える */
  onToggleHideCompleted: () => void
  /** いずれかのフィルタ(担当者・タグ・完了非表示)が有効か */
  filterActive: boolean
  /** フィルターダイアログを開く(section はフォーカスする節。省略可) */
  onOpenFilter: (section?: FilterSection) => void
  /** すべてのフィルタを解除する */
  onClearFilter: () => void
  /** 左グリッドのカラム状態(メニューのチェック表示に使う) */
  columnState: GridColumnState
  /** カラムの表示/非表示を切り替える */
  onToggleColumn: (key: GridColumnKey) => void
  /** カラムの表示・幅を既定状態に戻す */
  onResetColumns: () => void
  /** ガントを SVG 画像として書き出す */
  onExportSvg: () => void
  /** ガントを PNG 画像として書き出す */
  onExportPng: () => void
  onTitleChange: (title: string) => void
  /** 新規作成(空の TaskSpec から始める) */
  onNew: () => void
  /** 保存(.taskspec.yaml としてダウンロード) */
  onSave: () => void
  /** ファイルを選択して読み込む */
  onOpenFile: (file: File) => void
  /** 元に戻せるか(履歴あり) */
  canUndo: boolean
  /** やり直せるか(future あり) */
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** ＋ タスク(選択中なら兄弟の後ろ、未選択ならルート末尾) */
  onAdd: () => void
  onRemove: () => void
  onIndent: () => void
  onOutdent: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  /** [ヘルプ] → [taskaror について] のダイアログを開く */
  onAbout: () => void
}

/** 2 行目のツールバーに並べるタスク操作ボタンの定義 */
interface ToolButton {
  icon: IconName
  label: string
  onClick: () => void
  /** 選択中タスクがないと無効化する */
  needsSelection: boolean
  danger?: boolean
}

function Toolbar(props: ToolbarProps) {
  const {
    title,
    selectedId,
    viewMode,
    onViewModeChange,
    showCriticalPath,
    onToggleCriticalPath,
    hideCompleted,
    onToggleHideCompleted,
    filterActive,
    onOpenFilter,
    onClearFilter,
    columnState,
    onToggleColumn,
    onResetColumns,
    onExportSvg,
    onExportPng,
    onTitleChange,
    onNew,
    onSave,
    onOpenFile,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onAdd,
    onRemove,
    onIndent,
    onOutdent,
    onMoveUp,
    onMoveDown,
    onAbout,
  } = props

  const noSelection = selectedId === null
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTitle = (event: ChangeEvent<HTMLInputElement>): void => {
    onTitleChange(event.target.value)
  }

  const handleOpenClick = (): void => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (file) onOpenFile(file)
    // 同じファイルを続けて選び直せるように値をリセットする
    event.target.value = ''
  }

  const menus: Menu[] = [
    {
      label: 'ファイル',
      items: [
        { kind: 'action', label: '新規', onSelect: onNew },
        { kind: 'action', label: '開く…', onSelect: handleOpenClick },
        { kind: 'action', label: '保存', onSelect: onSave },
        { kind: 'separator' },
        { kind: 'action', label: 'エクスポート(SVG)', onSelect: onExportSvg },
        { kind: 'action', label: 'エクスポート(PNG)', onSelect: onExportPng },
      ],
    },
    {
      label: '編集',
      items: [
        {
          kind: 'action',
          label: '元に戻す',
          onSelect: onUndo,
          disabled: !canUndo,
          shortcut: 'Ctrl+Z',
        },
        {
          kind: 'action',
          label: 'やり直し',
          onSelect: onRedo,
          disabled: !canRedo,
          shortcut: 'Ctrl+Shift+Z',
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'タスク追加',
          onSelect: onAdd,
          shortcut: 'Insert',
        },
        {
          kind: 'action',
          label: 'タスク削除',
          onSelect: onRemove,
          disabled: noSelection,
          shortcut: 'Delete',
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'タスク移動↑',
          onSelect: onMoveUp,
          disabled: noSelection,
          shortcut: 'Ctrl+↑',
        },
        {
          kind: 'action',
          label: 'タスク移動↓',
          onSelect: onMoveDown,
          disabled: noSelection,
          shortcut: 'Ctrl+↓',
        },
        {
          kind: 'action',
          label: 'インデント',
          onSelect: onIndent,
          disabled: noSelection,
          shortcut: 'Ctrl+→',
        },
        {
          kind: 'action',
          label: 'アウトデント',
          onSelect: onOutdent,
          disabled: noSelection,
          shortcut: 'Ctrl+←',
        },
      ],
    },
    {
      label: '表示',
      items: [
        {
          kind: 'radio',
          label: 'ガントチャート',
          checked: viewMode === 'gantt',
          onSelect: () => onViewModeChange('gantt'),
        },
        {
          kind: 'radio',
          label: 'YAML',
          checked: viewMode === 'yaml',
          onSelect: () => onViewModeChange('yaml'),
        },
        {
          kind: 'radio',
          label: 'WBS表',
          checked: viewMode === 'wbs',
          onSelect: () => onViewModeChange('wbs'),
        },
        { kind: 'separator' },
        {
          kind: 'checkbox',
          label: 'クリティカルパスを強調',
          checked: showCriticalPath,
          onSelect: onToggleCriticalPath,
        },
        {
          kind: 'submenu',
          label: 'カラム',
          items: [
            {
              kind: 'checkbox',
              label: '担当者',
              checked: isColumnVisible(columnState, 'assignees'),
              onSelect: () => onToggleColumn('assignees'),
            },
            {
              kind: 'checkbox',
              label: 'タグ',
              checked: isColumnVisible(columnState, 'tags'),
              onSelect: () => onToggleColumn('tags'),
            },
            {
              kind: 'checkbox',
              label: '進捗率',
              checked: isColumnVisible(columnState, 'progress'),
              onSelect: () => onToggleColumn('progress'),
            },
            {
              kind: 'checkbox',
              label: 'メモ',
              checked: isColumnVisible(columnState, 'note'),
              onSelect: () => onToggleColumn('note'),
            },
            { kind: 'separator' },
            {
              kind: 'action',
              label: 'カラムを既定に戻す',
              onSelect: onResetColumns,
              disabled: isDefaultColumnState(columnState),
            },
          ],
        },
        {
          kind: 'submenu',
          label: 'フィルター',
          items: [
            {
              kind: 'action',
              label: '担当者で絞り込む…',
              onSelect: () => onOpenFilter('assignees'),
            },
            {
              kind: 'action',
              label: 'タグで絞り込む…',
              onSelect: () => onOpenFilter('tags'),
            },
            {
              kind: 'checkbox',
              label: '完了タスクを非表示',
              checked: hideCompleted,
              onSelect: onToggleHideCompleted,
            },
            { kind: 'separator' },
            {
              kind: 'action',
              label: 'フィルターをすべて解除',
              onSelect: onClearFilter,
              disabled: !filterActive,
            },
          ],
        },
      ],
    },
    {
      label: 'ヘルプ',
      items: [
        {
          kind: 'link',
          label: '使い方',
          href: DOCS_URL,
        },
        {
          kind: 'link',
          label: 'GitHub リポジトリ',
          href: REPOSITORY_URL,
        },
        { kind: 'separator' },
        {
          kind: 'action',
          label: 'taskaror について',
          onSelect: onAbout,
        },
      ],
    },
  ]

  const tools: ToolButton[] = [
    {
      icon: 'add',
      label: 'タスク追加',
      onClick: onAdd,
      needsSelection: false,
    },
    {
      icon: 'delete',
      label: 'タスク削除',
      onClick: onRemove,
      needsSelection: true,
      danger: true,
    },
    {
      icon: 'outdent',
      label: 'アウトデント',
      onClick: onOutdent,
      needsSelection: true,
    },
    {
      icon: 'indent',
      label: 'インデント',
      onClick: onIndent,
      needsSelection: true,
    },
    {
      icon: 'moveUp',
      label: 'タスク移動↑',
      onClick: onMoveUp,
      needsSelection: true,
    },
    {
      icon: 'moveDown',
      label: 'タスク移動↓',
      onClick: onMoveDown,
      needsSelection: true,
    },
  ]

  return (
    <header className="app-header">
      <div className="header-row header-row-top">
        <span className="header-brand">taskaror</span>
        <input
          className="header-title"
          type="text"
          value={title}
          placeholder="プロジェクト名"
          aria-label="プロジェクト名"
          onChange={handleTitle}
        />
        <MenuBar menus={menus} />
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/* タスク操作はガント編集ビューの選択タスクに作用するため、そのビューでのみ表示する */}
      {viewMode === 'gantt' ? (
        <div
          className="header-row header-row-tools"
          role="toolbar"
          aria-label="タスク操作"
        >
          {tools.map((tool) => (
            <button
              key={tool.icon}
              type="button"
              className={`tool-button${tool.danger ? ' danger' : ''}`}
              // ツールチップ(title)は機能名のみ。ショートカットの併記はメニューバーの
              // 項目でのみ行う(重複を避ける)。aria-label も機能名にして簡潔に読み上げる。
              title={tool.label}
              aria-label={tool.label}
              disabled={tool.needsSelection && noSelection}
              onClick={tool.onClick}
            >
              <Icon name={tool.icon} />
            </button>
          ))}
          {/* フィルターは適用中かどうかが常に見えるよう右端に分けて置く */}
          <span className="tool-spacer" aria-hidden="true" />
          <button
            type="button"
            className={`tool-button${filterActive ? ' filter-active' : ''}`}
            title={filterActive ? 'フィルター(適用中)' : 'フィルター'}
            aria-label={filterActive ? 'フィルター(適用中)' : 'フィルター'}
            aria-haspopup="dialog"
            onClick={() => onOpenFilter()}
          >
            <Icon name="filter" />
          </button>
        </div>
      ) : null}
    </header>
  )
}

export default Toolbar
