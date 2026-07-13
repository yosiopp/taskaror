import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import { scheduleTasks, type ScheduledTask } from './schedule'

// 基準となる曜日(2026-07):
//  13(月) 14(火) 15(水) 16(木) 17(金) 18(土) 19(日) 20(月) 21(火) 22(水)
const TODAY = '2026-07-13'

function spec(tasks: TaskSpec['tasks']): TaskSpec {
  return { taskspec: '1.0', tasks }
}

function findSafe(
  rows: ScheduledTask[],
  id: string,
): ScheduledTask | undefined {
  for (const row of rows) {
    if (row.task.id === id) return row
    const nested = findSafe(row.children, id)
    if (nested) return nested
  }
  return undefined
}

function get(rows: ScheduledTask[], id: string): ScheduledTask {
  const found = findSafe(rows, id)
  if (!found) throw new Error(`scheduled task not found: ${id}`)
  return found
}

describe('scheduleTasks: 単一タスク', () => {
  it('明示 start + estimate から終了日を導出する', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' },
        { id: 'b', title: 'B', start: '2026-07-13', estimate: '1.5d' },
      ]),
      { today: TODAY },
    )
    expect(get(rows, 'a')).toMatchObject({
      start: '2026-07-13',
      end: '2026-07-13',
      durationDays: 1,
      isMilestone: false,
    })
    // 1.5d = 12h -> 2 営業日: 月・火
    expect(get(rows, 'b')).toMatchObject({
      start: '2026-07-13',
      end: '2026-07-14',
      durationDays: 2,
    })
  })

  it('土日始まりの start は翌営業日にずらす', () => {
    const rows = scheduleTasks(
      spec([{ id: 'a', title: 'A', start: '2026-07-18', estimate: '1d' }]),
      { today: TODAY },
    )
    expect(get(rows, 'a')).toMatchObject({
      start: '2026-07-20',
      end: '2026-07-20',
    })
  })

  it('estimate 未指定はマイルストーン(0d, 終了日 = 開始日)', () => {
    const rows = scheduleTasks(spec([{ id: 'm', title: 'M' }]), {
      today: TODAY,
    })
    expect(get(rows, 'm')).toMatchObject({
      start: TODAY,
      end: TODAY,
      durationDays: 0,
      isMilestone: true,
      isSummary: false,
    })
  })
})

describe('scheduleTasks: 開始日のフォールバック', () => {
  it('start も depends もないタスクはプロジェクト最早 start に揃う', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', start: '2026-07-15', estimate: '1d' },
        { id: 'b', title: 'B', estimate: '1d' },
      ]),
      { today: TODAY },
    )
    // 最早 start は 07-15。b はそこに揃う
    expect(get(rows, 'b').start).toBe('2026-07-15')
  })

  it('明示 start が 1 つもなければ今日から開始する', () => {
    const rows = scheduleTasks(
      spec([{ id: 'a', title: 'A', estimate: '1d' }]),
      {
        today: TODAY,
      },
    )
    expect(get(rows, 'a').start).toBe(TODAY)
  })
})

describe('scheduleTasks: 依存関係', () => {
  it('依存チェーンは先行の終了日の翌営業日から開始する', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', estimate: '1d' },
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
        { id: 'c', title: 'C', estimate: '2d', depends: ['b'] },
      ]),
      { today: TODAY },
    )
    expect(get(rows, 'a')).toMatchObject({
      start: '2026-07-13',
      end: '2026-07-13',
    })
    expect(get(rows, 'b')).toMatchObject({
      start: '2026-07-14',
      end: '2026-07-14',
    })
    expect(get(rows, 'c')).toMatchObject({
      start: '2026-07-15',
      end: '2026-07-16',
    })
  })

  it('先行がマイルストーン(0d)なら同日から開始する', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'm', title: 'M', start: '2026-07-13' },
        { id: 'n', title: 'N', estimate: '1d', depends: ['m'] },
      ]),
      { today: TODAY },
    )
    expect(get(rows, 'n')).toMatchObject({
      start: '2026-07-13',
      end: '2026-07-13',
    })
  })

  it('複数依存では最も遅い先行に合わせる', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', estimate: '1d' }, // 07-13 終了
        { id: 'b', title: 'B', estimate: '3d' }, // 07-13〜07-15 終了
        { id: 'c', title: 'C', estimate: '1d', depends: ['a', 'b'] },
      ]),
      { today: TODAY },
    )
    // b の終了(07-15)の翌営業日 07-16
    expect(get(rows, 'c').start).toBe('2026-07-16')
  })

  it('週をまたぐ依存は土日を飛ばす', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', start: '2026-07-17', estimate: '1d' }, // 金曜終了
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
      ]),
      { today: TODAY },
    )
    // 金曜の翌営業日は月曜
    expect(get(rows, 'b').start).toBe('2026-07-20')
  })
})

describe('scheduleTasks: 親子(サマリー)', () => {
  it('親は子の期間を包絡する', () => {
    const rows = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          tasks: [
            { id: 'c1', title: 'C1', estimate: '1d' },
            { id: 'c2', title: 'C2', estimate: '2d', depends: ['c1'] },
          ],
        },
      ]),
      { today: TODAY },
    )
    const p = get(rows, 'p')
    expect(p.isSummary).toBe(true)
    expect(p.start).toBe('2026-07-13') // c1 開始
    expect(p.end).toBe('2026-07-15') // c2 終了(07-14〜07-15)
    expect(get(rows, 'c2')).toMatchObject({
      start: '2026-07-14',
      end: '2026-07-15',
    })
  })

  it('親の start は子の開始下限として伝播する', () => {
    const rows = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          start: '2026-07-20',
          tasks: [
            { id: 'c1', title: 'C1', estimate: '1d' },
            { id: 'c2', title: 'C2', estimate: '2d', depends: ['c1'] },
          ],
        },
      ]),
      { today: TODAY },
    )
    expect(get(rows, 'c1').start).toBe('2026-07-20')
    expect(get(rows, 'c2')).toMatchObject({
      start: '2026-07-21',
      end: '2026-07-22',
    })
    expect(get(rows, 'p')).toMatchObject({
      start: '2026-07-20',
      end: '2026-07-22',
    })
  })

  it('子の明示 start は親の下限より優先する', () => {
    const rows = scheduleTasks(
      spec([
        {
          id: 'p',
          title: 'P',
          start: '2026-07-20',
          tasks: [{ id: 'c', title: 'C', start: '2026-07-13', estimate: '1d' }],
        },
      ]),
      { today: TODAY },
    )
    expect(get(rows, 'c').start).toBe('2026-07-13')
    expect(get(rows, 'p').start).toBe('2026-07-13')
  })
})

describe('scheduleTasks: 異常系', () => {
  it('循環依存でも例外を投げずに結果を返す', () => {
    const rows = scheduleTasks(
      spec([
        { id: 'a', title: 'A', estimate: '1d', depends: ['b'] },
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
      ]),
      { today: TODAY },
    )
    expect(rows).toHaveLength(2)
    expect(get(rows, 'a').start).toBeDefined()
  })
})
