import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../types/taskspec'
import {
  DEFAULT_FILE_BASENAME,
  emptyTaskSpec,
  ganttImageFileName,
  sanitizeFileBaseName,
  taskSpecFileName,
} from './file'

describe('emptyTaskSpec', () => {
  it('taskspec 1.0 の空タスク spec を返す', () => {
    expect(emptyTaskSpec()).toEqual({ taskspec: '1.0', tasks: [] })
  })
})

describe('sanitizeFileBaseName', () => {
  it('ファイル名に使えない文字を - に置換する', () => {
    expect(sanitizeFileBaseName('a/b:c*d?e')).toBe('a-b-c-d-e')
  })

  it('空白を - にまとめる', () => {
    expect(sanitizeFileBaseName('プロジェクト 名  A')).toBe('プロジェクト-名-A')
  })

  it('先頭・末尾の . と - を取り除く', () => {
    expect(sanitizeFileBaseName('  ..name-- ')).toBe('name')
  })

  it('日本語はそのまま残す', () => {
    expect(sanitizeFileBaseName('ECサイト構築')).toBe('ECサイト構築')
  })

  it('使える文字が無ければ空文字を返す', () => {
    expect(sanitizeFileBaseName('///')).toBe('')
    expect(sanitizeFileBaseName('   ')).toBe('')
  })
})

describe('taskSpecFileName', () => {
  const base: TaskSpec = { taskspec: '1.0', tasks: [] }

  it('info.title から <name>.taskspec.yaml を導出する', () => {
    expect(taskSpecFileName({ ...base, info: { title: 'ECサイト構築' } })).toBe(
      'ECサイト構築.taskspec.yaml',
    )
  })

  it('title が無ければ既定名を使う', () => {
    expect(taskSpecFileName(base)).toBe(
      `${DEFAULT_FILE_BASENAME}.taskspec.yaml`,
    )
  })

  it('title がサニタイズ後に空なら既定名を使う', () => {
    expect(taskSpecFileName({ ...base, info: { title: '??' } })).toBe(
      `${DEFAULT_FILE_BASENAME}.taskspec.yaml`,
    )
  })
})

describe('ganttImageFileName', () => {
  const base: TaskSpec = { taskspec: '1.0', tasks: [] }

  it('info.title から <name>.<ext> を導出する', () => {
    expect(
      ganttImageFileName({ ...base, info: { title: 'ECサイト構築' } }, 'svg'),
    ).toBe('ECサイト構築.svg')
    expect(
      ganttImageFileName({ ...base, info: { title: 'ECサイト構築' } }, 'png'),
    ).toBe('ECサイト構築.png')
  })

  it('title が無ければ既定名を使う', () => {
    expect(ganttImageFileName(base, 'svg')).toBe(`${DEFAULT_FILE_BASENAME}.svg`)
    expect(ganttImageFileName(base, 'png')).toBe(`${DEFAULT_FILE_BASENAME}.png`)
  })
})
