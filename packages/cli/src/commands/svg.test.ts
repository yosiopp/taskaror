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
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { svgCommand } from './svg'

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

// フィクスチャと出力ファイルの置き場(一時ディレクトリ)
let base: string
let schemaNgPath: string
let brokenYamlPath: string

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'taskaror-svg-'))

  // schema 違反: estimate の形式不正
  schemaNgPath = path.join(base, 'schema-ng.taskspec.yaml')
  await writeFile(
    schemaNgPath,
    [
      "taskspec: '1.0'",
      'tasks:',
      '  - id: a',
      '    title: 設計',
      '    estimate: 3週間',
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

describe('svg コマンド', () => {
  it('-o 省略時は標準出力へ SVG を出力して 0 を返す', async () => {
    const code = await svgCommand.run([examplePath])
    expect(code).toBe(0)
    const svg = joined(logSpy)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('</svg>')
    // タスク名ラベル・バー・時間軸が描かれている
    expect(svg).toContain('API設計')
    expect(svg).toContain('data-gantt-bar=')
    expect(joined(errorSpy)).toBe('')
  })

  it('-o 指定時はファイルへ書き出して 0 を返す', async () => {
    const outPath = path.join(base, 'out.svg')
    const code = await svgCommand.run([examplePath, '-o', outPath])
    expect(code).toBe(0)
    const svg = await readFile(outPath, 'utf-8')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('API設計')
    expect(joined(logSpy)).toContain(`SVG を書き出しました: ${outPath}`)
  })

  it('--output でも書き出せる(-o の別名)', async () => {
    const outPath = path.join(base, 'out-long.svg')
    const code = await svgCommand.run([examplePath, '--output', outPath])
    expect(code).toBe(0)
    const svg = await readFile(outPath, 'utf-8')
    expect(svg.startsWith('<svg')).toBe(true)
  })

  it('schema 違反のある spec は問題を列挙して 1 を返す', async () => {
    const code = await svgCommand.run([schemaNgPath])
    expect(code).toBe(1)
    const output = joined(errorSpy)
    expect(output).toContain('件の問題があるため SVG を出力できません')
    expect(output).toContain(
      'tasks[0].estimate: 見積工数の形式が正しくありません',
    )
    expect(joined(logSpy)).toBe('')
  })

  it('YAML として壊れたファイルは日本語エラーで 1 を返す', async () => {
    const code = await svgCommand.run([brokenYamlPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('YAML を解析できません')
  })

  it('存在しないファイルは日本語エラーで 1 を返す', async () => {
    const code = await svgCommand.run([path.join(base, 'no-such-file.yaml')])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('ファイルが見つかりません')
  })

  it('ファイル指定なしは使い方エラーで 2 を返す', async () => {
    const code = await svgCommand.run([])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('spec ファイルを 1 つ指定してください')
  })

  it('ファイルを 2 つ指定すると使い方エラーで 2 を返す', async () => {
    const code = await svgCommand.run([examplePath, examplePath])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('spec ファイルを 1 つ指定してください')
  })

  it('不明なオプションは 2 を返す', async () => {
    const code = await svgCommand.run(['--nosuchoption', examplePath])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('svg のオプションを解釈できません')
  })

  it.each([['--help'], ['-h']])(
    '%s で svg の使い方を表示して 0 を返す',
    async (flag) => {
      const code = await svgCommand.run([flag])
      expect(code).toBe(0)
      expect(joined(logSpy)).toContain('使い方: taskaror svg')
    },
  )
})
