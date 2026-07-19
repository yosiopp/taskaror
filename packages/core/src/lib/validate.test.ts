import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import { validateSchema, validateStructure, validateTaskSpec } from './validate'

describe('validateSchema', () => {
  it('妥当な TaskSpec では問題なし', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      info: { title: 'サンプル' },
      tasks: [
        { id: 'a', title: 'A', estimate: '1.5d', start: '2026-07-13' },
        { id: 'b', title: 'B', depends: ['a'], 'x-ticket': 'DEV-1' },
      ],
    }
    expect(validateSchema(spec)).toEqual([])
  })

  it('taskspec バージョンが違うと const エラー', () => {
    const issues = validateSchema({ taskspec: '2.0', tasks: [] })
    expect(issues).toEqual([
      { path: 'taskspec', message: '値は "1.0" である必要があります' },
    ])
  })

  it('必須プロパティ欠如を報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a' }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].title',
      message: 'title は必須です',
    })
  })

  it('許可されていないプロパティを報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', foo: 1 }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].foo',
      message: '許可されていないプロパティです: foo',
    })
  })

  it('x- 拡張プロパティは許可される', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', 'x-anything': { nested: true } }],
    })
    expect(issues).toEqual([])
  })

  it('estimate の形式違反を分かりやすく報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', estimate: '3週間' }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].estimate',
      message:
        '見積工数の形式が正しくありません(整数部 4 桁までの数値 + h/d。例: "1.5d", "4h")',
    })
  })

  it('estimate の整数部が 5 桁以上ならスキーマ違反として弾く', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', estimate: '999999999999d' }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].estimate',
      message:
        '見積工数の形式が正しくありません(整数部 4 桁までの数値 + h/d。例: "1.5d", "4h")',
    })
  })

  it('id の形式違反を報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: '1abc', title: 'A' }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].id',
      message:
        'id は英字で始まり、以降は英数字・ドット・ハイフン・アンダースコアのみ使用できます',
    })
  })

  it('start の日付形式違反を報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', start: '2026/07/13' }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].start',
      message: '日付の形式が正しくありません(YYYY-MM-DD)',
    })
  })

  it('progress の範囲違反を報告する', () => {
    const issues = validateSchema({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', progress: 150 }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].progress',
      message: '100 以下である必要があります',
    })
  })
})

describe('validateStructure', () => {
  it('妥当な依存関係では問題なし', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', depends: ['a'] },
      ],
    }
    expect(validateStructure(spec)).toEqual([])
  })

  it('id の重複を全階層で検出する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [
        { id: 'dup', title: 'A', tasks: [{ id: 'dup', title: '子' }] },
        { id: 'b', title: 'B' },
      ],
    }
    const issues = validateStructure(spec)
    expect(issues).toEqual([
      {
        path: 'tasks[0].tasks[0].id',
        message: 'id "dup" が重複しています(全タスクでユニークにしてください)',
      },
    ])
  })

  it('存在しない depends を検出する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', depends: ['missing', 'a'] }],
    }
    const issues = validateStructure(spec)
    expect(issues).toContainEqual({
      path: 'tasks[0].depends[0]',
      message: '依存先のタスク "missing" が見つかりません',
    })
  })

  it('直接の循環を検出する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [
        { id: 'a', title: 'A', depends: ['b'] },
        { id: 'b', title: 'B', depends: ['a'] },
      ],
    }
    const issues = validateStructure(spec)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/依存関係が循環しています/)
  })

  it('間接的な循環を検出する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [
        { id: 'a', title: 'A', depends: ['c'] },
        { id: 'b', title: 'B', depends: ['a'] },
        { id: 'c', title: 'C', depends: ['b'] },
      ],
    }
    const issues = validateStructure(spec)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/a → c → b → a|依存関係が循環/)
  })

  it('自己依存を循環として検出する', () => {
    const spec: TaskSpec = {
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', depends: ['a'] }],
    }
    const issues = validateStructure(spec)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('a → a')
  })
})

describe('validateTaskSpec', () => {
  it('スキーマ違反があれば構造検証まで進まない', () => {
    const issues = validateTaskSpec({ taskspec: '2.0', tasks: [] })
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('taskspec')
  })

  it('スキーマは妥当だが構造に問題があれば構造エラーを返す', () => {
    const issues = validateTaskSpec({
      taskspec: '1.0',
      tasks: [{ id: 'a', title: 'A', depends: ['x'] }],
    })
    expect(issues).toContainEqual({
      path: 'tasks[0].depends[0]',
      message: '依存先のタスク "x" が見つかりません',
    })
  })
})
