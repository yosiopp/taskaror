import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli, usage } from './cli'

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

describe('runCli(ディスパッチ)', () => {
  it('引数なしで使い方を表示して 0 を返す', async () => {
    const code = await runCli([])
    expect(code).toBe(0)
    expect(joined(logSpy)).toContain('使い方: taskaror')
  })

  it.each([['--help'], ['-h']])(
    '%s で使い方を表示して 0 を返す',
    async (flag) => {
      const code = await runCli([flag])
      expect(code).toBe(0)
      expect(joined(logSpy)).toContain('使い方: taskaror')
    },
  )

  it.each([['--version'], ['-v']])(
    '%s で package.json のバージョンを表示して 0 を返す',
    async (flag) => {
      const pkgPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'package.json',
      )
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        version: string
      }
      const code = await runCli([flag])
      expect(code).toBe(0)
      expect(joined(logSpy)).toContain(pkg.version)
    },
  )

  it('不明なコマンドはエラーメッセージ+使い方を表示して 2 を返す', async () => {
    const code = await runCli(['nosuchcommand'])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('不明なコマンドです: nosuchcommand')
    expect(joined(errorSpy)).toContain('使い方: taskaror')
  })

  it('不明なオプションはエラーメッセージ+使い方を表示して 2 を返す', async () => {
    const code = await runCli(['--nosuchoption'])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('不明なオプションです: --nosuchoption')
  })

  it('レジストリ由来でないプロトタイプのプロパティ名はコマンドとして扱わない', async () => {
    const code = await runCli(['constructor'])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('不明なコマンドです: constructor')
  })
})

describe('usage', () => {
  it('ヘルプ・バージョンのオプション説明を含む', () => {
    const text = usage()
    expect(text).toContain('-h, --help')
    expect(text).toContain('-v, --version')
  })
})
