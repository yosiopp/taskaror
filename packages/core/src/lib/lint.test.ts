import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import { lintTaskSpec, type LintIssue } from './lint'

// 基準となる曜日(2026-07):
//  10(金) 11(土) 12(日) 13(月) 14(火) 15(水) 16(木) 17(金) 18(土) 19(日) 20(月)
const TODAY = '2026-07-13'

function spec(tasks: TaskSpec['tasks']): TaskSpec {
  return { taskspec: '1.0', tasks }
}

function lint(tasks: TaskSpec['tasks']): LintIssue[] {
  return lintTaskSpec(spec(tasks), { today: TODAY })
}

function byRule(issues: LintIssue[], rule: string): LintIssue[] {
  return issues.filter((issue) => issue.rule === rule)
}

describe('lintTaskSpec: parent-estimate', () => {
  it('子を持つタスクの estimate を warning にする', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        estimate: '3d',
        tasks: [{ id: 'c', title: 'C', estimate: '1d' }],
      },
    ])
    const found = byRule(issues, 'parent-estimate')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      path: 'tasks[0]',
      taskId: 'p',
    })
    expect(found[0].message).toContain('3d')
  })

  it('子のないタスクの estimate と、estimate のない親は指摘しない', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        tasks: [{ id: 'c', title: 'C', estimate: '1d' }],
      },
    ])
    expect(byRule(issues, 'parent-estimate')).toHaveLength(0)
  })
})

describe('lintTaskSpec: start-before-parent', () => {
  it('親の start より前の子の明示 start を warning にする', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        start: '2026-07-20',
        tasks: [{ id: 'c', title: 'C', start: '2026-07-15', estimate: '2d' }],
      },
    ])
    const found = byRule(issues, 'start-before-parent')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      path: 'tasks[0].tasks[0]',
      taskId: 'c',
    })
    expect(found[0].message).toContain('2026-07-20')
  })

  it('親の depends から伝播する下限より前の子の明示 start を warning にする', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-13', estimate: '3d' }, // 〜07-15 終了
      {
        id: 'p',
        title: 'P',
        depends: ['a'],
        // 下限は a の終了(07-15)の翌営業日 07-16
        tasks: [{ id: 'c', title: 'C', start: '2026-07-14', estimate: '1d' }],
      },
    ])
    const found = byRule(issues, 'start-before-parent')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ path: 'tasks[1].tasks[0]', taskId: 'c' })
    expect(found[0].message).toContain('2026-07-16')
  })

  it('下限と同日の明示 start は指摘しない', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        start: '2026-07-20',
        tasks: [{ id: 'c', title: 'C', start: '2026-07-20', estimate: '1d' }],
      },
    ])
    expect(byRule(issues, 'start-before-parent')).toHaveLength(0)
  })

  it('土日の start が調整の結果、下限に収まる場合は指摘しない(調整後で比較)', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        start: '2026-07-20', // 月曜
        tasks: [{ id: 'c', title: 'C', start: '2026-07-18', estimate: '1d' }], // 土曜 → 調整後 07-20
      },
    ])
    expect(byRule(issues, 'start-before-parent')).toHaveLength(0)
  })
})

describe('lintTaskSpec: start-before-depends', () => {
  it('先行の完了から導かれる開始可能日より前の明示 start を warning にする', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-13', estimate: '3d' }, // 〜07-15 終了
      {
        id: 'b',
        title: 'B',
        start: '2026-07-14', // 開始可能日は 07-16
        estimate: '2d',
        depends: ['a'],
      },
    ])
    const found = byRule(issues, 'start-before-depends')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      path: 'tasks[1]',
      taskId: 'b',
    })
    expect(found[0].message).toContain('"a"')
    expect(found[0].message).toContain('2026-07-16')
  })

  it('開始可能日と同日の明示 start は指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-13', estimate: '3d' },
      {
        id: 'b',
        title: 'B',
        start: '2026-07-16',
        estimate: '2d',
        depends: ['a'],
      },
    ])
    expect(byRule(issues, 'start-before-depends')).toHaveLength(0)
  })

  it('先行が 0d マイルストーンなら同日の明示 start は指摘しない', () => {
    const issues = lint([
      { id: 'm', title: 'M', start: '2026-07-13' }, // 0d マイルストーン
      {
        id: 'n',
        title: 'N',
        start: '2026-07-13', // 同日開始は正しい導出
        estimate: '1d',
        depends: ['m'],
      },
    ])
    expect(byRule(issues, 'start-before-depends')).toHaveLength(0)
  })

  it('先行が 0d マイルストーンでも、その前日の明示 start は warning にする', () => {
    const issues = lint([
      { id: 'm', title: 'M', start: '2026-07-13' },
      {
        id: 'n',
        title: 'N',
        start: '2026-07-10', // 金曜。マイルストーン(07-13)より前
        estimate: '1d',
        depends: ['m'],
      },
    ])
    expect(byRule(issues, 'start-before-depends')).toHaveLength(1)
  })

  it('金曜終了の先行に対する土曜 start は調整後(月曜)で比較して指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-17', estimate: '1d' }, // 金曜終了
      {
        id: 'b',
        title: 'B',
        start: '2026-07-18', // 土曜 → 調整後 07-20(月)= 開始可能日
        estimate: '1d',
        depends: ['a'],
      },
    ])
    expect(byRule(issues, 'start-before-depends')).toHaveLength(0)
  })

  it('複数依存では最も遅い先行を挙げて warning にする', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' }, // 07-13 終了
      { id: 'b', title: 'B', start: '2026-07-13', estimate: '3d' }, // 07-15 終了
      {
        id: 'c',
        title: 'C',
        start: '2026-07-14',
        estimate: '1d',
        depends: ['a', 'b'],
      },
    ])
    const found = byRule(issues, 'start-before-depends')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('"b"')
    expect(found[0].message).toContain('2026-07-16')
  })
})

describe('lintTaskSpec: hierarchy-depends', () => {
  it('祖先への依存を warning にする', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        tasks: [
          {
            id: 'c',
            title: 'C',
            tasks: [{ id: 'g', title: 'G', estimate: '1d', depends: ['p'] }],
          },
        ],
      },
    ])
    const found = byRule(issues, 'hierarchy-depends')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      path: 'tasks[0].tasks[0].tasks[0]',
      taskId: 'g',
    })
    expect(found[0].message).toContain('祖先')
  })

  it('子孫への依存を warning にする', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        depends: ['g'],
        tasks: [
          {
            id: 'c',
            title: 'C',
            tasks: [{ id: 'g', title: 'G', estimate: '1d' }],
          },
        ],
      },
    ])
    const found = byRule(issues, 'hierarchy-depends')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ path: 'tasks[0]', taskId: 'p' })
    expect(found[0].message).toContain('子孫')
  })

  it('兄弟(別サブツリー)への依存は指摘しない', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        tasks: [
          { id: 'c1', title: 'C1', estimate: '1d' },
          { id: 'c2', title: 'C2', estimate: '1d', depends: ['c1'] },
        ],
      },
    ])
    expect(byRule(issues, 'hierarchy-depends')).toHaveLength(0)
  })
})

describe('lintTaskSpec: completed-before-predecessor', () => {
  it('progress 100 のタスクが未完了の先行に依存していたら warning にする', () => {
    const issues = lint([
      { id: 'a', title: 'A', estimate: '2d', progress: 60 },
      { id: 'b', title: 'B', estimate: '1d', progress: 100, depends: ['a'] },
    ])
    const found = byRule(issues, 'completed-before-predecessor')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'warning',
      path: 'tasks[1]',
      taskId: 'b',
    })
    expect(found[0].message).toContain('"a"')
    expect(found[0].message).toContain('60')
  })

  it('先行がサマリーの場合は未完了の子孫を挙げて warning にする', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        tasks: [
          { id: 'c1', title: 'C1', estimate: '1d', progress: 100 },
          { id: 'c2', title: 'C2', estimate: '1d', progress: 50 },
        ],
      },
      { id: 'b', title: 'B', estimate: '1d', progress: 100, depends: ['p'] },
    ])
    const found = byRule(issues, 'completed-before-predecessor')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('"c2"')
  })

  it('先行が完了(progress 100)なら指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', estimate: '2d', progress: 100 },
      { id: 'b', title: 'B', estimate: '1d', progress: 100, depends: ['a'] },
    ])
    expect(byRule(issues, 'completed-before-predecessor')).toHaveLength(0)
  })

  it('先行の progress 未指定は「進捗不明」として指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', estimate: '2d' },
      { id: 'b', title: 'B', estimate: '1d', progress: 100, depends: ['a'] },
    ])
    expect(byRule(issues, 'completed-before-predecessor')).toHaveLength(0)
  })

  it('自タスクの progress が 100 未満なら指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', estimate: '2d', progress: 60 },
      { id: 'b', title: 'B', estimate: '1d', progress: 90, depends: ['a'] },
    ])
    expect(byRule(issues, 'completed-before-predecessor')).toHaveLength(0)
  })
})

describe('lintTaskSpec: weekend-start', () => {
  it('土曜の明示 start を info にする(翌営業日を案内)', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-18', estimate: '1d' },
    ])
    const found = byRule(issues, 'weekend-start')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      severity: 'info',
      path: 'tasks[0]',
      taskId: 'a',
    })
    expect(found[0].message).toContain('土曜日')
    expect(found[0].message).toContain('2026-07-20')
  })

  it('日曜の明示 start を info にする', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-19', estimate: '1d' },
    ])
    const found = byRule(issues, 'weekend-start')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('日曜日')
  })

  it('平日の明示 start は指摘しない', () => {
    const issues = lint([
      { id: 'a', title: 'A', start: '2026-07-13', estimate: '1d' },
    ])
    expect(byRule(issues, 'weekend-start')).toHaveLength(0)
  })
})

describe('lintTaskSpec: 全体', () => {
  it('矛盾のない spec は指摘なし', () => {
    const issues = lint([
      {
        id: 'design',
        title: '設計',
        tasks: [
          { id: 'api', title: 'API設計', estimate: '1.5d', progress: 50 },
          { id: 'db', title: 'DB設計', estimate: '4h' },
        ],
      },
      { id: 'impl', title: '実装', estimate: '3d', depends: ['design'] },
    ])
    expect(issues).toHaveLength(0)
  })

  it('複数の指摘を文書順に返す', () => {
    const issues = lint([
      {
        id: 'p',
        title: 'P',
        estimate: '3d',
        start: '2026-07-20',
        tasks: [{ id: 'c', title: 'C', start: '2026-07-15', estimate: '1d' }],
      },
      { id: 'w', title: 'W', start: '2026-07-18', estimate: '1d' },
    ])
    expect(issues.map((issue) => issue.rule)).toEqual([
      'parent-estimate',
      'start-before-parent',
      'weekend-start',
    ])
  })
})
