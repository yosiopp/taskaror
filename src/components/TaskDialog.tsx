/**
 * タスクの全フィールドをまとめて編集するモーダルダイアログ。
 * グリッド行のダブルクリックで開き、title / estimate / start / 担当 / 依存 /
 * 進捗 / タグ / メモ をローカル下書きで編集し、[適用] で一括コミットする。
 * インライン編集(グリッドのセル)と違い、依存・タグ・メモも含めて編集できる。
 */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Task } from '../types/taskspec'
import type { FlatTask } from '../lib/taskspec'
import type { TaskFields } from '../lib/editor'
import { collectAncestors, collectIds } from '../lib/editor'

/** estimate の妥当な入力形式(空、または数値+h/d)。TaskGrid と同一 */
const ESTIMATE_RE = /^\d+(\.\d+)?(h|d)$/

export interface TaskDialogProps {
  /** 編集対象のタスク(サブツリーを含む spec 上の実体) */
  task: Task
  /** 依存先の選択肢に使う全タスク(深さ付き平坦化) */
  allTasks: FlatTask[]
  /** 閉じる(キャンセル) */
  onClose: () => void
  /** 変更をまとめて確定する(1 履歴にまとまる) */
  onSubmit: (changes: Partial<TaskFields>) => void
}

function TaskDialog({ task, allTasks, onClose, onSubmit }: TaskDialogProps) {
  const [title, setTitle] = useState(task.title)
  const [estimate, setEstimate] = useState(task.estimate ?? '')
  const [start, setStart] = useState(task.start ?? '')
  const [assignees, setAssignees] = useState((task.assignees ?? []).join(', '))
  const [depends, setDepends] = useState<string[]>(task.depends ?? [])
  const [progress, setProgress] = useState(
    task.progress != null ? String(task.progress) : '',
  )
  const [tags, setTags] = useState((task.tags ?? []).join(', '))
  const [note, setNote] = useState(task.note ?? '')

  const titleRef = useRef<HTMLInputElement>(null)

  // 開いたら最初のフィールドにフォーカスする
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  // Esc で閉じる(ダイアログはモーダルなので画面全体で受ける)
  useEffect(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // 依存先にできないタスク: 自分自身・子孫(collectIds)と祖先(論理的循環を防ぐ)
  const excluded = collectIds([task])
  const ancestors = collectAncestors(allTasks, task.id)
  const dependOptions = allTasks.filter(
    (flat) => !excluded.has(flat.task.id) && !ancestors.has(flat.task.id),
  )

  const estimateInvalid =
    estimate.trim() !== '' && !ESTIMATE_RE.test(estimate.trim())

  const toggleDepend = (id: string): void => {
    setDepends((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (estimateInvalid) return
    const trimmedProgress = progress.trim()
    const progressNum =
      trimmedProgress === ''
        ? undefined
        : clamp(Math.round(Number(trimmedProgress)), 0, 100)
    onSubmit({
      title: title.trim(),
      estimate: estimate.trim(),
      start: start.trim(),
      assignees: splitCsv(assignees),
      depends,
      progress: Number.isNaN(progressNum as number) ? undefined : progressNum,
      tags: splitCsv(tags),
      note,
    })
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        // 背景(バックドロップ)クリックで閉じる。カード内クリックは無視する
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="task-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        onSubmit={handleSubmit}
      >
        <div className="task-dialog-head">
          <h2 id="task-dialog-title" className="task-dialog-title">
            タスクの編集
          </h2>
          <span className="task-dialog-id">{task.id}</span>
          <button
            type="button"
            className="task-dialog-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="task-dialog-body">
          <label className="task-field task-field-wide">
            <span className="task-field-label">タスク名</span>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="task-field">
            <span className="task-field-label">見積</span>
            <input
              type="text"
              value={estimate}
              placeholder="例: 1.5d / 4h"
              aria-invalid={estimateInvalid}
              onChange={(e) => setEstimate(e.target.value)}
            />
            {estimateInvalid ? (
              <span className="task-field-error">
                「数値+h」または「数値+d」で入力してください
              </span>
            ) : null}
          </label>

          <label className="task-field">
            <span className="task-field-label">開始</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>

          <label className="task-field">
            <span className="task-field-label">担当</span>
            <input
              type="text"
              value={assignees}
              placeholder="カンマ区切り"
              onChange={(e) => setAssignees(e.target.value)}
            />
          </label>

          <label className="task-field">
            <span className="task-field-label">進捗(%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={progress}
              onChange={(e) => setProgress(e.target.value)}
            />
          </label>

          <label className="task-field task-field-wide">
            <span className="task-field-label">タグ</span>
            <input
              type="text"
              value={tags}
              placeholder="カンマ区切り"
              onChange={(e) => setTags(e.target.value)}
            />
          </label>

          <div className="task-field task-field-wide">
            <span className="task-field-label">依存(先行タスク)</span>
            {dependOptions.length === 0 ? (
              <p className="task-depends-empty">選択できるタスクがありません</p>
            ) : (
              <ul className="task-depends-list">
                {dependOptions.map((flat) => (
                  <li key={flat.task.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={depends.includes(flat.task.id)}
                        onChange={() => toggleDepend(flat.task.id)}
                      />
                      <span className="task-depends-id">{flat.task.id}</span>
                      <span className="task-depends-title">
                        {flat.task.title || '(無題)'}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="task-field task-field-wide">
            <span className="task-field-label">メモ(Markdown)</span>
            <textarea
              value={note}
              rows={4}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="task-dialog-foot">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="primary" disabled={estimateInvalid}>
            適用
          </button>
        </div>
      </form>
    </div>
  )
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

export default TaskDialog
