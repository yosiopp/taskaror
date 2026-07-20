import { useMemo, useState } from 'react'
import { scheduleTasks } from '@taskaror/core/schedule'
import type { ScheduledTask } from '@taskaror/core/schedule'
import {
  computeGanttLayout,
  filterScheduled,
  flattenScheduled,
} from '@taskaror/core/gantt'
import type { GanttFilter, GanttLayout, GanttRow } from '@taskaror/core/gantt'
import { computeCriticalPath } from '@taskaror/core/critical'
import { toHolidaySet } from '@taskaror/core/date'
import type { HolidaySet } from '@taskaror/core/date'
import type { TaskSpec } from '@taskaror/core/types/taskspec'
import { DAY_WIDTH, ROW_HEIGHT } from '../components/constants'

interface Derived {
  visibleRows: GanttRow[]
  layout: GanttLayout
  /** スケジュール導出結果のツリー(WBS 表の開始・終了に使う) */
  scheduled: ScheduledTask[]
  /** 営業日から除外する日付集合(info.holidays)。ガントの操作系にも渡す */
  holidays: HolidaySet
}

export interface DerivedGantt extends Derived {
  /** クリティカルパス(slack 0 のタスク鎖)の id 集合 */
  criticalIds: ReadonlySet<string>
  /** スケジュール計算に失敗したときのメッセージ(正常時は null) */
  error: string | null
}

const EMPTY_LAYOUT: GanttLayout = computeGanttLayout([], {
  dayWidth: DAY_WIDTH,
  rowHeight: ROW_HEIGHT,
})

/**
 * spec / collapsedIds からスケジュール・ガントレイアウトを派生させる。
 * 不正な estimate 等で scheduleTasks が throw しうるので try/catch で囲み、
 * 直近の正常な派生結果を保持して計算失敗時はそれを表示し続ける(アプリを落とさない)。
 * dispatch で spec が変わるたびに再計算されるので、編集はリアルタイムに反映される。
 */
export function useDerivedGantt(
  spec: TaskSpec,
  collapsedIds: ReadonlySet<string>,
  today: string,
  filter: GanttFilter,
): DerivedGantt {
  const computation = useMemo<
    { ok: true; derived: Derived } | { ok: false; error: string }
  >(() => {
    try {
      const holidays = toHolidaySet(spec.info?.holidays)
      const scheduled = scheduleTasks(spec, { today })
      // 担当者・タグ・完了タスク非表示は「ガント表示のフィルタ」。scheduled 本体
      // (WBS 表・クリティカルパス算出に使う)は全タスクのまま保ち、表示行だけを絞る。
      const displayRoots = filterScheduled(scheduled, filter)
      const rows = flattenScheduled(displayRoots, collapsedIds)
      const layout = computeGanttLayout(rows, {
        dayWidth: DAY_WIDTH,
        rowHeight: ROW_HEIGHT,
        today,
        holidays,
      })
      return {
        ok: true,
        derived: { visibleRows: rows, layout, scheduled, holidays },
      }
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : String(thrown)
      return { ok: false, error: message }
    }
  }, [spec, collapsedIds, today, filter])

  // 直近の正常な派生結果。正常に計算できたらレンダー中に取り込む
  // (収束するので追加のレンダーは 1 回のみ)。
  const [lastGood, setLastGood] = useState<Derived>({
    visibleRows: [],
    layout: EMPTY_LAYOUT,
    scheduled: [],
    holidays: toHolidaySet(),
  })
  if (computation.ok && computation.derived !== lastGood) {
    setLastGood(computation.derived)
  }

  const derived = computation.ok ? computation.derived : lastGood

  // クリティカルパスの id 集合。スケジュール導出結果から算出する。
  // scheduled は spec / today が変わると作り直されるので、その参照変化で再計算される。
  const criticalIds = useMemo(
    () => computeCriticalPath(derived.scheduled, derived.holidays),
    [derived.scheduled, derived.holidays],
  )

  return {
    ...derived,
    criticalIds,
    error: computation.ok ? null : computation.error,
  }
}
