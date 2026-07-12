/**
 * 画面上部のツールバー。プロジェクトタイトル入力と、選択中タスクに対する
 * 編集操作(追加・削除・階層変更・並び替え)のボタンを並べる。
 */
import { useRef } from 'react'
import type { ChangeEvent } from 'react'

export interface ToolbarProps {
  /** プロジェクトタイトル(spec.info?.title) */
  title: string
  /** 選択中タスク id(未選択なら null) */
  selectedId: string | null
  onTitleChange: (title: string) => void
  /** 新規作成(空の TaskSpec から始める) */
  onNew: () => void
  /** 保存(.taskspec.yaml としてダウンロード) */
  onSave: () => void
  /** ファイルを選択して読み込む */
  onOpenFile: (file: File) => void
  /** ＋ タスク(選択中なら兄弟の後ろ、未選択ならルート末尾) */
  onAdd: () => void
  /** ＋ 子タスク(選択中の子として追加) */
  onAddChild: () => void
  onRemove: () => void
  onIndent: () => void
  onOutdent: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function Toolbar(props: ToolbarProps) {
  const {
    title,
    selectedId,
    onTitleChange,
    onNew,
    onSave,
    onOpenFile,
    onAdd,
    onAddChild,
    onRemove,
    onIndent,
    onOutdent,
    onMoveUp,
    onMoveDown,
  } = props

  // 選択中タスクがないと成立しない操作は無効化する
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

  return (
    <header className="toolbar">
      <span className="toolbar-brand">taskaror</span>
      <input
        className="toolbar-title"
        type="text"
        value={title}
        placeholder="プロジェクト名"
        aria-label="プロジェクト名"
        onChange={handleTitle}
      />
      <div className="toolbar-actions">
        <button type="button" onClick={onNew}>
          新規
        </button>
        <button type="button" onClick={onSave}>
          保存
        </button>
        <button type="button" onClick={handleOpenClick}>
          開く
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".yaml,.yml"
          hidden
          onChange={handleFileChange}
        />
      </div>
      <span className="toolbar-sep" aria-hidden="true" />
      <div className="toolbar-actions">
        <button type="button" onClick={onAdd}>
          ＋ タスク
        </button>
        <button type="button" onClick={onAddChild} disabled={noSelection}>
          ＋ 子タスク
        </button>
        <button
          type="button"
          className="danger"
          onClick={onRemove}
          disabled={noSelection}
        >
          削除
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button type="button" onClick={onOutdent} disabled={noSelection}>
          ← アウトデント
        </button>
        <button type="button" onClick={onIndent} disabled={noSelection}>
          インデント →
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={noSelection}
          aria-label="上へ移動"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={noSelection}
          aria-label="下へ移動"
        >
          ↓
        </button>
      </div>
    </header>
  )
}

export default Toolbar
