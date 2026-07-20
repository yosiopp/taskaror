/**
 * ガント表示のフィルタ(担当者・タグ・完了タスク非表示)を編集するモーダルダイアログ。
 * [表示] → [フィルター] の [担当者で絞り込む…] / [タグで絞り込む…]、または
 * ツールバーのフィルターアイコンから開く。チェックの変更は即座にガントへ反映される
 * (spec は変更しないビューフィルタ)。
 */
import { useEffect, useRef } from 'react'
import { EMPTY_GANTT_FILTER, isGanttFilterActive } from '@taskaror/core/gantt'
import type { GanttFilter } from '@taskaror/core/gantt'

/** 開いたとき最初にフォーカスする節(メニューのどの項目から開いたか) */
export type FilterSection = 'assignees' | 'tags'

export interface FilterDialogProps {
  /** 絞り込み候補の担当者(spec 内の全担当者。重複なし) */
  assignees: string[]
  /** 絞り込み候補のタグ(spec 内の全タグ。重複なし) */
  tags: string[]
  /** 現在のフィルタ */
  filter: GanttFilter
  /** フィルタの変更(チェック操作のたびに即時反映する) */
  onChange: (filter: GanttFilter) => void
  /** 閉じる(フィルタは適用されたまま) */
  onClose: () => void
  /** 開いたとき最初にフォーカスする節(ツールバーから開いたときは未指定) */
  initialSection?: FilterSection
}

/** values に value があれば外し、なければ足す */
function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value]
}

/**
 * チェックボックスに並べる選択肢。spec 内の候補に、選択中だが spec に存在しない値
 * (別ファイルを読み込んだ後など)も混ぜて表示し、解除できるようにする。
 */
function optionsOf(
  available: readonly string[],
  selected: readonly string[],
): string[] {
  return [...new Set([...available, ...selected])].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )
}

function FilterDialog({
  assignees,
  tags,
  filter,
  onChange,
  onClose,
  initialSection,
}: FilterDialogProps) {
  const firstAssigneeRef = useRef<HTMLInputElement>(null)
  const firstTagRef = useRef<HTMLInputElement>(null)

  // どのメニュー項目から開いたかに応じて、対応する節の先頭チェックへフォーカスする
  useEffect(() => {
    if (initialSection === 'assignees') firstAssigneeRef.current?.focus()
    else if (initialSection === 'tags') firstTagRef.current?.focus()
  }, [initialSection])

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

  const sections: {
    key: FilterSection
    title: string
    options: string[]
    selected: readonly string[]
    empty: string
    firstRef: typeof firstAssigneeRef
  }[] = [
    {
      key: 'assignees',
      title: '担当者で絞り込む',
      options: optionsOf(assignees, filter.assignees),
      selected: filter.assignees,
      empty: '担当者が設定されたタスクがありません',
      firstRef: firstAssigneeRef,
    },
    {
      key: 'tags',
      title: 'タグで絞り込む',
      options: optionsOf(tags, filter.tags),
      selected: filter.tags,
      empty: 'タグが設定されたタスクがありません',
      firstRef: firstTagRef,
    },
  ]

  const toggleSection = (key: FilterSection, value: string): void => {
    onChange({ ...filter, [key]: toggleValue(filter[key], value) })
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        // 背景(バックドロップ)クリックで閉じる。カード内クリックは無視する
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="filter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-dialog-title"
      >
        <div className="task-dialog-head">
          <h2 id="filter-dialog-title" className="task-dialog-title">
            フィルター
          </h2>
          <button
            type="button"
            className="task-dialog-close"
            aria-label="閉じる"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="filter-dialog-body">
          {sections.map((section) => (
            <section key={section.key} className="filter-section">
              <h3 className="filter-section-title">{section.title}</h3>
              {section.options.length === 0 ? (
                <p className="filter-empty">{section.empty}</p>
              ) : (
                <ul className="filter-options">
                  {section.options.map((value, index) => (
                    <li key={value}>
                      <label>
                        <input
                          type="checkbox"
                          ref={index === 0 ? section.firstRef : undefined}
                          checked={section.selected.includes(value)}
                          onChange={() => toggleSection(section.key, value)}
                        />
                        <span className="filter-option-label">{value}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <label className="filter-hide-completed">
            <input
              type="checkbox"
              checked={filter.hideCompleted}
              onChange={() =>
                onChange({ ...filter, hideCompleted: !filter.hideCompleted })
              }
            />
            <span className="filter-option-label">完了タスクを非表示</span>
          </label>
        </div>

        <div className="task-dialog-foot">
          <button
            type="button"
            disabled={!isGanttFilterActive(filter)}
            onClick={() => onChange(EMPTY_GANTT_FILTER)}
          >
            すべて解除
          </button>
          <button type="button" className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilterDialog
