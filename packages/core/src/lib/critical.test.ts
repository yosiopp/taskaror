import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import { scheduleTasks } from './schedule'
import { computeCriticalPath } from './critical'

// 基準となる曜日(2026-07):
//  13(月) 14(火) 15(水) 16(木) 17(金) 18(土) 19(日) 20(月)
const TODAY = '2026-07-13'

function spec(tasks: TaskSpec['tasks']): TaskSpec {
  return { taskspec: '1.0', tasks }
}

/** タスク定義からクリティカルな id 集合をソート済み配列で得る */
function criticalOf(tasks: TaskSpec['tasks']): string[] {
  const set = computeCriticalPath(scheduleTasks(spec(tasks), { today: TODAY }))
  return [...set].sort()
}

describe('computeCriticalPath', () => {
  it('タスクが 0 件なら空集合', () => {
    expect(computeCriticalPath([]).size).toBe(0)
  })

  it('単一タスクはそれ自身がクリティカル', () => {
    expect(criticalOf([{ id: 'a', title: 'A', estimate: '1d' }])).toEqual(['a'])
  })

  it('直列チェーンは全タスクがクリティカル', () => {
    expect(
      criticalOf([
        { id: 'a', title: 'A', estimate: '1d' },
        { id: 'b', title: 'B', estimate: '1d', depends: ['a'] },
        { id: 'c', title: 'C', estimate: '2d', depends: ['b'] },
      ]),
    ).toEqual(['a', 'b', 'c'])
  })

  it('並列 2 分岐では長い方の枝だけがクリティカル', () => {
    expect(
      criticalOf([
        { id: 'a', title: 'A', estimate: '1d' },
        { id: 'b', title: 'B', estimate: '2d', depends: ['a'] }, // 長い枝
        { id: 'c', title: 'C', estimate: '1d', depends: ['a'] }, // 短い枝
        { id: 'd', title: 'D', estimate: '1d', depends: ['b', 'c'] },
      ]),
    ).toEqual(['a', 'b', 'd'])
  })

  it('依存なし複数では最も遅く終わるタスクだけがクリティカル', () => {
    expect(
      criticalOf([
        { id: 'short', title: 'S', estimate: '1d' },
        { id: 'long', title: 'L', estimate: '3d' },
      ]),
    ).toEqual(['long'])
  })

  it('先行マイルストーンと同日開始の後続もクリティカル', () => {
    expect(
      criticalOf([
        { id: 'm', title: 'M', start: '2026-07-13' }, // 0d マイルストーン
        { id: 'n', title: 'N', estimate: '1d', depends: ['m'] },
      ]),
    ).toEqual(['m', 'n'])
  })

  it('サマリーは配下にクリティカルなリーフを含めばクリティカル(depends 先がサマリーでも追従)', () => {
    // design(設計)は api(end 07-14)が終端。impl はサマリー design に依存する。
    expect(
      criticalOf([
        {
          id: 'design',
          title: '設計',
          tasks: [
            { id: 'api', title: 'API', estimate: '1.5d' }, // 07-13〜07-14
            { id: 'db', title: 'DB', estimate: '4h' }, // 07-13
          ],
        },
        { id: 'impl', title: '実装', depends: ['design'] }, // マイルストーン
      ]),
    ).toEqual(['api', 'design', 'impl'])
  })
})
