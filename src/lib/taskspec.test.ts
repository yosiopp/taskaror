import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import {
  TaskSpecError,
  flattenTasks,
  parseTaskSpec,
  serializeTaskSpec,
} from './taskspec'

describe('parseTaskSpec', () => {
  it('最小構成の TaskSpec を読み込める', () => {
    const spec = parseTaskSpec('taskspec: "1.0"\ntasks: []\n')
    expect(spec.taskspec).toBe('1.0')
    expect(spec.tasks).toEqual([])
  })

  it('info とタスク階層を読み込める', () => {
    const spec = parseTaskSpec(`
taskspec: '1.0'
info:
  title: サンプル
tasks:
  - id: parent
    title: 親タスク
    tasks:
      - id: child
        title: 子タスク
        estimate: 1.5d
`)
    expect(spec.info?.title).toBe('サンプル')
    expect(spec.tasks[0].tasks?.[0].id).toBe('child')
    expect(spec.tasks[0].tasks?.[0].estimate).toBe('1.5d')
  })

  it('ルートがオブジェクトでなければ TaskSpecError を投げる', () => {
    expect(() => parseTaskSpec('- 1\n- 2\n')).toThrow(TaskSpecError)
    expect(() => parseTaskSpec('文字列だけ')).toThrow(TaskSpecError)
  })

  it('taskspec バージョンが未対応なら TaskSpecError を投げる', () => {
    expect(() => parseTaskSpec('taskspec: "2.0"\ntasks: []\n')).toThrow(
      TaskSpecError,
    )
    expect(() => parseTaskSpec('tasks: []\n')).toThrow(TaskSpecError)
  })

  it('tasks が配列でなければ TaskSpecError を投げる', () => {
    expect(() => parseTaskSpec('taskspec: "1.0"\ntasks: {}\n')).toThrow(
      TaskSpecError,
    )
    expect(() => parseTaskSpec('taskspec: "1.0"\n')).toThrow(TaskSpecError)
  })
})

describe('serializeTaskSpec', () => {
  it('シリアライズした YAML を再度パースすると等価になる', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      info: { title: 'ラウンドトリップ' },
      tasks: [
        {
          id: 'a',
          title: 'タスクA',
          estimate: '4h',
          assignees: ['tanaka'],
          progress: 50,
          tasks: [{ id: 'a1', title: '子タスク' }],
        },
        { id: 'b', title: 'タスクB', depends: ['a'], 'x-ticket': 'DEV-1' },
      ],
    }
    expect(parseTaskSpec(serializeTaskSpec(spec))).toEqual(spec)
  })
})

describe('flattenTasks', () => {
  it('タスク階層を深さ付きで平坦化する', () => {
    const spec = parseTaskSpec(`
taskspec: '1.0'
tasks:
  - id: a
    title: A
    tasks:
      - id: a1
        title: A1
        tasks:
          - id: a1x
            title: A1X
      - id: a2
        title: A2
  - id: b
    title: B
`)
    const flat = flattenTasks(spec.tasks)
    expect(flat.map(({ task, depth }) => [task.id, depth])).toEqual([
      ['a', 0],
      ['a1', 1],
      ['a1x', 2],
      ['a2', 1],
      ['b', 0],
    ])
  })

  it('空配列は空のまま返す', () => {
    expect(flattenTasks([])).toEqual([])
  })
})
