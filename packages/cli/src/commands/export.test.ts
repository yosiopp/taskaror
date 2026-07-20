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
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findChrome } from '../chrome'
import type { ExportDeps } from './export'
import {
  createPdfCommand,
  createPngCommand,
  defaultOutputPath,
  pdfCommand,
  pngCommand,
} from './export'

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
let specPath: string
let schemaNgPath: string

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'taskaror-export-'))

  // 既定の出力先(拡張子の置き換え)を検証するため一時ディレクトリへコピーする
  specPath = path.join(base, 'plan.taskspec.yaml')
  await copyFile(examplePath, specPath)

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
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

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

/** ブラウザ起動の記録 1 件 */
interface ChromeCall {
  chromePath: string
  args: string[]
  outFile: string
  /** 起動時点で読んだ HTML の内容(あれば) */
  html: string | null
}

/**
 * ブラウザを起動せず、出力先(outFile)へダミーを書き出すだけの偽依存を作る。
 * 呼び出し内容は calls に記録する。
 */
function fakeDeps(overrides: Partial<ExportDeps> = {}): {
  deps: ExportDeps
  calls: ChromeCall[]
} {
  const calls: ChromeCall[] = []
  const deps: ExportDeps = {
    findChrome: () => ({ ok: true, path: '/fake/chrome' }),
    runChrome: async (chromePath, args, outFile) => {
      const url = args[args.length - 1]
      const html = url.startsWith('file://')
        ? readFileSync(fileURLToPath(url), 'utf-8')
        : null
      calls.push({ chromePath, args, outFile, html })
      writeFileSync(outFile, 'dummy')
      return { ok: true }
    },
    ...overrides,
  }
  return { deps, calls }
}

describe('defaultOutputPath', () => {
  it.each([
    ['plan.taskspec.yaml', 'png', 'plan.png'],
    ['plan.taskspec.yml', 'pdf', 'plan.pdf'],
    ['plan.yaml', 'png', 'plan.png'],
    ['dir/plan.YAML', 'png', 'dir/plan.png'],
    ['plan', 'png', 'plan.png'],
    ['plan.txt', 'png', 'plan.txt.png'],
  ])('%s + %s → %s', (file, ext, expected) => {
    expect(defaultOutputPath(file, ext)).toBe(expected)
  })
})

describe('png コマンド', () => {
  it('-o 省略時は入力の拡張子を .png に変えたパスへ書き出す', async () => {
    const { deps, calls } = fakeDeps()
    const code = await createPngCommand(deps).run([specPath])
    expect(code).toBe(0)
    const outPath = path.join(base, 'plan.png')
    expect(existsSync(outPath)).toBe(true)
    expect(joined(logSpy)).toContain(`PNG を書き出しました: ${outPath}`)
    expect(joined(errorSpy)).toBe('')

    // ブラウザへの指示: ヘッドレス・SVG 寸法どおりの窓・既定倍率 2・HTML の file URL。
    // 出力はまず一時ディレクトリへ書かせる
    expect(calls).toHaveLength(1)
    const { args, outFile, html } = calls[0]
    expect(args).toContain('--headless')
    expect(args.some((arg) => /^--window-size=\d+,\d+$/.test(arg))).toBe(true)
    expect(args).toContain('--force-device-scale-factor=2')
    expect(args).toContain(`--screenshot=${outFile}`)
    expect(outFile.endsWith('gantt.png')).toBe(true)
    expect(outFile).not.toBe(outPath)
    expect(args[args.length - 1]).toMatch(/^file:\/\/.+\.html$/)
    // HTML には SVG 本体と PDF 用のページ指定が含まれる
    expect(html).toContain('<svg')
    expect(html).toContain('@page')
    // 一時ディレクトリ(HTML・出力)は実行後に片付ける
    expect(existsSync(fileURLToPath(args[args.length - 1]))).toBe(false)
    expect(existsSync(outFile)).toBe(false)
  })

  it('-o 指定時はそのパスへ書き出す', async () => {
    const { deps } = fakeDeps()
    const outPath = path.join(base, 'custom.png')
    const code = await createPngCommand(deps).run([specPath, '-o', outPath])
    expect(code).toBe(0)
    expect(existsSync(outPath)).toBe(true)
  })

  it('--scale で描画倍率を変えられる', async () => {
    const { deps, calls } = fakeDeps()
    const code = await createPngCommand(deps).run([
      specPath,
      '-o',
      path.join(base, 'x3.png'),
      '--scale',
      '3',
    ])
    expect(code).toBe(0)
    expect(calls[0].args).toContain('--force-device-scale-factor=3')
  })

  it.each([['0'], ['5'], ['abc']])(
    '--scale %s は範囲外エラーで 2 を返す',
    async (scale) => {
      const { deps, calls } = fakeDeps()
      const code = await createPngCommand(deps).run([
        specPath,
        '--scale',
        scale,
      ])
      expect(code).toBe(2)
      expect(joined(errorSpy)).toContain('--scale は 1〜4 の数値')
      expect(calls).toHaveLength(0)
    },
  )

  it('ブラウザが見つからなければ 1 を返す', async () => {
    const { deps } = fakeDeps({
      findChrome: () => ({
        ok: false,
        message: 'Chrome / Chromium / Edge が見つかりません',
      }),
    })
    const code = await createPngCommand(deps).run([specPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain(
      'Chrome / Chromium / Edge が見つかりません',
    )
  })

  it('ブラウザの実行が失敗したら 1 を返す', async () => {
    const { deps } = fakeDeps({
      runChrome: async () => ({ ok: false, message: '終了コード 21' }),
    })
    const code = await createPngCommand(deps).run([specPath])
    expect(code).toBe(1)
    const output = joined(errorSpy)
    expect(output).toContain('PNG への変換に失敗しました')
    expect(output).toContain('終了コード 21')
  })

  it('ブラウザが出力を書き出さなかったら 1 を返す', async () => {
    const { deps } = fakeDeps({ runChrome: async () => ({ ok: true }) })
    const code = await createPngCommand(deps).run([
      specPath,
      '-o',
      path.join(base, 'never-written.png'),
    ])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain('PNG が書き出されませんでした')
  })

  it('schema 違反のある spec は問題を列挙して 1 を返す', async () => {
    const { deps, calls } = fakeDeps()
    const code = await createPngCommand(deps).run([schemaNgPath])
    expect(code).toBe(1)
    expect(joined(errorSpy)).toContain(
      '件の問題があるため PNG を出力できません',
    )
    expect(calls).toHaveLength(0)
  })

  it('ファイル指定なしは使い方エラーで 2 を返す', async () => {
    const { deps } = fakeDeps()
    const code = await createPngCommand(deps).run([])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('spec ファイルを 1 つ指定してください')
  })

  it.each([['--help'], ['-h']])(
    '%s で png の使い方を表示して 0 を返す',
    async (flag) => {
      const { deps } = fakeDeps()
      const code = await createPngCommand(deps).run([flag])
      expect(code).toBe(0)
      const output = joined(logSpy)
      expect(output).toContain('使い方: taskaror png')
      expect(output).toContain('TASKAROR_CHROME')
    },
  )
})

describe('pdf コマンド', () => {
  it('-o 省略時は入力の拡張子を .pdf に変えたパスへ書き出す', async () => {
    const { deps, calls } = fakeDeps()
    const code = await createPdfCommand(deps).run([specPath])
    expect(code).toBe(0)
    const outPath = path.join(base, 'plan.pdf')
    expect(existsSync(outPath)).toBe(true)
    expect(joined(logSpy)).toContain(`PDF を書き出しました: ${outPath}`)

    const { args, outFile } = calls[0]
    expect(args).toContain('--headless')
    expect(args).toContain('--no-pdf-header-footer')
    expect(args).toContain(`--print-to-pdf=${outFile}`)
    expect(outFile.endsWith('gantt.pdf')).toBe(true)
    // PNG 用の指示(倍率・窓サイズ)は渡さない
    expect(args.some((arg) => arg.startsWith('--window-size='))).toBe(false)
  })

  it('--scale は受け付けない(2 を返す)', async () => {
    const { deps } = fakeDeps()
    const code = await createPdfCommand(deps).run([specPath, '--scale', '3'])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('pdf のオプションを解釈できません')
  })
})

// ブラウザが見つかる環境でだけ、実際に変換して中身を確かめる(CI の Linux ランナーにも Chrome がある)
const realChrome = findChrome()
describe.skipIf(!realChrome.ok)('Chrome 実機での変換', () => {
  it('png: 実際に PNG が生成される', { timeout: 120_000 }, async () => {
    const outPath = path.join(base, 'real.png')
    const code = await pngCommand.run([specPath, '-o', outPath])
    expect(code).toBe(0)
    const png = await readFile(outPath)
    // PNG のマジックナンバー
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('pdf: 実際に PDF が生成される', { timeout: 120_000 }, async () => {
    const outPath = path.join(base, 'real.pdf')
    const code = await pdfCommand.run([specPath, '-o', outPath])
    expect(code).toBe(0)
    const pdf = await readFile(outPath)
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  })
})
