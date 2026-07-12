import { describe, expect, it } from 'vitest'
import type { Task } from '../types/taskspec'
import { computeWbs } from './wbs'

/** テスト用の簡易タスク生成ヘルパー */
function task(id: string, children?: Task[]): Task {
  const t: Task = { id, title: id }
  if (children) t.tasks = children
  return t
}

describe('computeWbs', () => {
  it('トップレベルは 1, 2, 3 … と採番する', () => {
    const rows = computeWbs([task('a'), task('b'), task('c')])
    expect(rows.map((r) => [r.task.id, r.wbs, r.depth])).toEqual([
      ['a', '1', 0],
      ['b', '2', 0],
      ['c', '3', 0],
    ])
  })

  it('ネストは親.子(1, 1.1, 1.2, 2 …)で採番する', () => {
    const rows = computeWbs([task('a', [task('a1'), task('a2')]), task('b')])
    expect(rows.map((r) => [r.task.id, r.wbs, r.depth])).toEqual([
      ['a', '1', 0],
      ['a1', '1.1', 1],
      ['a2', '1.2', 1],
      ['b', '2', 0],
    ])
  })

  it('多階層でもドット連結で採番し、表示順(深さ優先)に並べる', () => {
    const rows = computeWbs([
      task('a', [task('a1', [task('a1x')]), task('a2')]),
      task('b', [task('b1')]),
    ])
    expect(rows.map((r) => [r.task.id, r.wbs, r.depth])).toEqual([
      ['a', '1', 0],
      ['a1', '1.1', 1],
      ['a1x', '1.1.1', 2],
      ['a2', '1.2', 1],
      ['b', '2', 0],
      ['b1', '2.1', 1],
    ])
  })

  it('空配列は空を返す', () => {
    expect(computeWbs([])).toEqual([])
  })
})
