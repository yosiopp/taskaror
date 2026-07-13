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
import { validateCommand } from './validate'

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

// 不正な spec のフィクスチャ置き場(一時ディレクトリ)
let base: string
let schemaNgPath: string
let structureNgPath: string
let brokenYamlPath: string
let wrongVersionPath: string

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'taskaror-validate-'))

  // schema 違反: estimate の形式不正+progress の範囲外
  schemaNgPath = path.join(base, 'schema-ng.taskspec.yaml')
  await writeFile(
    schemaNgPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: 設計',
      '    estimate: 3週間',
      '    progress: 120',
      '',
    ].join('\n'),
  )

  // 構造違反: id の重複+存在しない依存先(schema は通る)
  structureNgPath = path.join(base, 'structure-ng.taskspec.yaml')
  await writeFile(
    structureNgPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: 設計',
      '  - id: a',
      '    title: 実装',
      '    depends:',
      '      - missing',
      '',
    ].join('\n'),
  )

  // YAML として壊れている(フロー配列が閉じていない)
  brokenYamlPath = path.join(base, 'broken.taskspec.yaml')
  await writeFile(brokenYamlPath, "taskspec: '1.0'\ntasks: [\n")

  // YAML としては正しいが taskspec バージョンが未対応
  wrongVersionPath = path.join(base, 'wrong-version.taskspec.yaml')
  await writeFile(wrongVersionPath, "taskspec: '2.0'\ntasks: []\n")
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

describe('validate コマンド', () => {
  it('正常な spec は OK と表示して 0 を返す', async () => {
    const code = await validateCommand.run([examplePath])
    expect(code).toBe(0)
    expect(joined(logSpy)).toContain(`${examplePath}: OK`)
    expect(joined(errorSpy)).toBe('')
  })

  it('schema 違反はパス: メッセージ形式で列挙して 1 を返す', async () => {
    const code = await validateCommand.run([schemaNgPath])
    expect(code).toBe(1)
    const output = joined(errorSpy)
    expect(output).toContain('件の問題が見つかりました')
    expect(output).toContain(
      'tasks[0].estimate: 見積工数の形式が正しくありません',
    )
    expect(output).toContain('tasks[0].progress: 100 以下である必要があります')
  })

  it('構造違反(id 重複・依存先なし)を報告して 1 を返す', async () => {
    const code = await validateCommand.run([structureNgPath])
    expect(code).toBe(1)
    const output = joined(errorSpy)
    expect(output).toContain('tasks[1].id: id "a" が重複しています')
    expect(output).toContain(
      'tasks[1].depends[0]: 依存先のタスク "missing" が見つかりません',
    )
  })

  it('YAML として壊れたファイルは位置付きの日本語エラーで 1 を返す', async () => {
    const code = await validateCommand.run([brokenYamlPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('YAML を解析できません')
  })

  it('未対応の taskspec バージョンは日本語エラーで 1 を返す', async () => {
    const code = await validateCommand.run([wrongVersionPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('未対応の taskspec バージョンです: 2.0')
  })

  it('存在しないファイルは日本語エラーで 1 を返す', async () => {
    const code = await validateCommand.run([
      path.join(base, 'no-such-file.yaml'),
    ])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('ファイルが見つかりません')
  })

  it('複数ファイルで一部に問題があればサマリを表示して 1 を返す', async () => {
    const code = await validateCommand.run([examplePath, schemaNgPath])
    expect(code).toBe(1)
    expect(joined(logSpy)).toContain(`${examplePath}: OK`)
    expect(joined(errorSpy)).toContain(
      '2 ファイル中 1 ファイルに問題があります',
    )
  })

  it('複数ファイルがすべて正常ならサマリを表示して 0 を返す', async () => {
    const code = await validateCommand.run([examplePath, examplePath])
    expect(code).toBe(0)
    expect(joined(logSpy)).toContain('2 ファイルすべて OK')
  })

  it('ファイル指定なしは使い方エラーで 2 を返す', async () => {
    const code = await validateCommand.run([])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain(
      '検証する spec ファイルを 1 つ以上指定してください',
    )
  })

  it('不明なオプションは 2 を返す', async () => {
    const code = await validateCommand.run(['--nosuchoption', examplePath])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('validate の引数を解釈できません')
  })
})
