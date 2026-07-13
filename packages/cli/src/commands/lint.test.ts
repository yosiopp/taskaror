import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { MockInstance } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintCommand } from './lint'

/** リポジトリ同梱の正常な spec(examples/ecommerce.taskspec.yaml) */
const examplePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'examples',
  'ecommerce.taskspec.yaml',
)

// spec のフィクスチャ置き場(一時ディレクトリ)
let base: string
let warningPath: string
let infoOnlyPath: string
let validateNgPath: string
let brokenYamlPath: string

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'taskaror-lint-'))

  // warning あり: 親の estimate(parent-estimate)+ 親の start より前の子の start(start-before-parent)
  warningPath = path.join(base, 'warning.taskspec.yaml')
  await writeFile(
    warningPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: p',
      '    title: 親タスク',
      '    estimate: 3d',
      "    start: '2026-07-20'",
      '    tasks:',
      '      - id: c',
      '        title: 子タスク',
      "        start: '2026-07-15'",
      '        estimate: 1d',
      '',
    ].join('\n'),
  )

  // info のみ: 土曜始まりの start(weekend-start)
  infoOnlyPath = path.join(base, 'info-only.taskspec.yaml')
  await writeFile(
    infoOnlyPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: キックオフ',
      "    start: '2026-07-18'",
      '    estimate: 1d',
      '',
    ].join('\n'),
  )

  // validate エラー: id の重複(schema は通るが構造検証で落ちる)
  validateNgPath = path.join(base, 'validate-ng.taskspec.yaml')
  await writeFile(
    validateNgPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: 設計',
      '  - id: a',
      '    title: 実装',
      '',
    ].join('\n'),
  )

  // YAML として壊れている(フロー配列が閉じていない)
  brokenYamlPath = path.join(base, 'broken.taskspec.yaml')
  await writeFile(brokenYamlPath, "taskspec: '1.0'\ntasks: [\n")
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

// テスト対象の出力(console.log / console.error)を捕捉するためのスパイ
let logSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** スパイに渡された全出力を 1 つの文字列に結合する */
function joined(spy: MockInstance): string {
  return spy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n')
}

describe('lint コマンド', () => {
  it('指摘のない spec は OK と表示して 0 を返す', async () => {
    const code = await lintCommand.run([examplePath])
    expect(code).toBe(0)
    expect(joined(logSpy)).toContain(`${examplePath}: OK`)
    expect(joined(errorSpy)).toBe('')
  })

  it('warning がある spec は指摘を列挙して 1 を返す', async () => {
    const code = await lintCommand.run([warningPath])
    expect(code).toBe(1)
    const output = joined(logSpy)
    expect(output).toContain('2 件の指摘があります(warning 2 件・info 0 件)')
    expect(output).toContain('[warning] tasks[0] (p): parent-estimate:')
    expect(output).toContain(
      '[warning] tasks[0].tasks[0] (c): start-before-parent:',
    )
  })

  it('info のみの spec は指摘を表示しつつ 0 を返す', async () => {
    const code = await lintCommand.run([infoOnlyPath])
    expect(code).toBe(0)
    const output = joined(logSpy)
    expect(output).toContain('warning 0 件・info 1 件')
    expect(output).toContain('[info] tasks[0] (a): weekend-start:')
  })

  it('validate エラーのある spec は lint せず validate を促して 1 を返す', async () => {
    const code = await lintCommand.run([validateNgPath])
    expect(code).toBe(1)
    const output = joined(errorSpy)
    expect(output).toContain('lint できません')
    expect(output).toContain('先に taskaror validate を通してください')
    expect(output).toContain('id "a" が重複しています')
  })

  it('YAML として壊れたファイルは日本語エラーで 1 を返す', async () => {
    const code = await lintCommand.run([brokenYamlPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('YAML を解析できません')
  })

  it('存在しないファイルは日本語エラーで 1 を返す', async () => {
    const code = await lintCommand.run([path.join(base, 'no-such-file.yaml')])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('ファイルが見つかりません')
  })

  it('複数ファイルで一部に指摘があればサマリを表示して 1 を返す', async () => {
    const code = await lintCommand.run([examplePath, warningPath])
    expect(code).toBe(1)
    expect(joined(logSpy)).toContain(`${examplePath}: OK`)
    expect(joined(errorSpy)).toContain(
      '2 ファイル中 1 ファイルに指摘があります',
    )
  })

  it('複数ファイルがすべて指摘なしならサマリを表示して 0 を返す', async () => {
    const code = await lintCommand.run([examplePath, examplePath])
    expect(code).toBe(0)
    expect(joined(logSpy)).toContain('2 ファイルすべて OK')
  })

  it('ファイル指定なしは使い方エラーで 2 を返す', async () => {
    const code = await lintCommand.run([])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain(
      'lint する spec ファイルを 1 つ以上指定してください',
    )
  })

  it('不明なオプションは 2 を返す', async () => {
    const code = await lintCommand.run(['--nosuchoption', examplePath])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('lint の引数を解釈できません')
  })
})
