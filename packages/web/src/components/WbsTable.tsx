/**
 * WBS 番号付きテーブルビュー(読み取り中心)。
 * WBS 番号(1, 1.1, …)は computeWbs で導出し、開始・終了は scheduleTasks の
 * 導出値を使う(どちらも保存しない)。
 * 行数が多くても崩れないよう縦スクロール可能にし、見出しは上部に固定する。
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ScheduledTask } from '@taskaror/core/schedule'
import { computeWbs } from '@taskaror/core/wbs'
import type { TaskSpec } from '@taskaror/core/types/taskspec'

export interface WbsTableProps {
  /** 現在の spec(WBS 番号とタスク情報の元) */
  spec: TaskSpec
  /** スケジュール導出結果のツリー(開始・終了の参照元。App の派生値を再利用する) */
  scheduled: ScheduledTask[]
}

/** ScheduledTask ツリーを id 引きの Map に平坦化する */
function indexScheduled(
  scheduled: ScheduledTask[],
  map: Map<string, ScheduledTask> = new Map(),
): Map<string, ScheduledTask> {
  for (const item of scheduled) {
    map.set(item.task.id, item)
    if (item.children.length > 0) indexScheduled(item.children, map)
  }
  return map
}

/** 空なら淡色のダッシュ、値があればそのまま表示する */
function orDash(value: string): ReactNode {
  if (value === '') return <span className="wbs-muted">—</span>
  return value
}

function WbsTable({ spec, scheduled }: WbsTableProps) {
  const rows = useMemo(() => computeWbs(spec.tasks), [spec])
  const scheduledById = useMemo(() => indexScheduled(scheduled), [scheduled])

  if (rows.length === 0) {
    return <div className="wbs-empty">タスクがありません</div>
  }

  return (
    <div className="wbs-view">
      <table className="wbs-table">
        <thead>
          <tr>
            <th className="wbs-col-num">WBS</th>
            <th className="wbs-col-name">タスク名</th>
            <th>担当</th>
            <th>見積</th>
            <th>開始</th>
            <th>終了</th>
            <th>進捗</th>
            <th>依存</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, wbs, depth }) => {
            const item = scheduledById.get(task.id)
            return (
              <tr key={task.id}>
                <td className="wbs-num">{wbs}</td>
                <td
                  className="wbs-name"
                  style={{ paddingLeft: 8 + depth * 16 }}
                >
                  {task.title || '(無題)'}
                </td>
                <td>{orDash((task.assignees ?? []).join(', '))}</td>
                <td>{orDash(task.estimate ?? '')}</td>
                <td>{orDash(item?.start ?? '')}</td>
                <td>{orDash(item?.end ?? '')}</td>
                <td>
                  {task.progress != null ? (
                    `${task.progress}%`
                  ) : (
                    <span className="wbs-muted">—</span>
                  )}
                </td>
                <td>{orDash((task.depends ?? []).join(', '))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default WbsTable
