import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findChrome, runChrome } from './chrome'

/** 指定したパス集合だけが存在するとみなす exists の偽実装 */
function existsIn(paths: string[]): (filePath: string) => boolean {
  const set = new Set(paths)
  return (filePath) => set.has(filePath)
}

describe('findChrome', () => {
  it('TASKAROR_CHROME が指すパスを最優先で使う', () => {
    const result = findChrome({
      env: { TASKAROR_CHROME: '/opt/my-chrome' },
      platform: 'linux',
      exists: existsIn(['/opt/my-chrome', '/usr/bin/google-chrome']),
    })
    expect(result).toEqual({ ok: true, path: '/opt/my-chrome' })
  })

  it('TASKAROR_CHROME のパスが存在しなければ探索せずエラーを返す', () => {
    const result = findChrome({
      env: { TASKAROR_CHROME: '/no/such/chrome' },
      platform: 'linux',
      exists: existsIn(['/usr/bin/google-chrome']),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('TASKAROR_CHROME')
      expect(result.message).toContain('/no/such/chrome')
    }
  })

  it('macOS では /Applications 配下の Chrome を見つける', () => {
    const chromePath =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    const result = findChrome({
      env: {},
      platform: 'darwin',
      exists: existsIn([chromePath]),
    })
    expect(result).toEqual({ ok: true, path: chromePath })
  })

  it('Linux では PATH からも探す', () => {
    const dir = '/home/user/bin'
    const result = findChrome({
      env: { PATH: `/usr/lib${path.delimiter}${dir}` },
      platform: 'linux',
      exists: existsIn([path.join(dir, 'chromium')]),
    })
    expect(result).toEqual({ ok: true, path: path.join(dir, 'chromium') })
  })

  it('Windows では Program Files 配下の Chrome / Edge を見つける', () => {
    const edgePath = path.join(
      'C:\\Program Files (x86)',
      'Microsoft',
      'Edge',
      'Application',
      'msedge.exe',
    )
    const result = findChrome({
      env: { 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' },
      platform: 'win32',
      exists: existsIn([edgePath]),
    })
    expect(result).toEqual({ ok: true, path: edgePath })
  })

  it('どこにも見つからなければ TASKAROR_CHROME を案内するエラーを返す', () => {
    const result = findChrome({
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      exists: () => false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain(
        'Chrome / Chromium / Edge が見つかりません',
      )
      expect(result.message).toContain('TASKAROR_CHROME')
    }
  })
})

describe('runChrome', () => {
  // ブラウザの代わりに node 自身を起動して、実行結果の扱いだけを検証する
  let base: string

  beforeAll(async () => {
    base = await mkdtemp(path.join(tmpdir(), 'taskaror-chrome-'))
  })

  afterAll(async () => {
    await rm(base, { recursive: true, force: true })
  })

  it('プロセスが終了しなくても、出力ファイルが完成したら ok を返して終了させる', async () => {
    // Chrome 150(macOS)で確認した「書き出し後も終了しない」挙動の再現
    const outFile = path.join(base, 'hang.png')
    const result = await runChrome(
      process.execPath,
      [
        '-e',
        'require("node:fs").writeFileSync(process.argv[1], "x".repeat(100)); setInterval(() => {}, 1000)',
        outFile,
      ],
      outFile,
    )
    expect(result).toEqual({ ok: true })
  }, 15_000)

  it('終了コード 0 なら ok を返す', async () => {
    const result = await runChrome(
      process.execPath,
      ['-e', 'process.exit(0)'],
      path.join(base, 'none.png'),
    )
    expect(result).toEqual({ ok: true })
  })

  it('終了コードが 0 以外なら stderr の末尾を添えて失敗を返す', async () => {
    const result = await runChrome(
      process.execPath,
      ['-e', 'console.error("boom"); process.exit(3)'],
      path.join(base, 'none.png'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('終了コード 3')
      expect(result.message).toContain('boom')
    }
  })

  it('起動できない実行ファイルは失敗を返す', async () => {
    const result = await runChrome(
      '/no/such/browser',
      ['--headless'],
      path.join(base, 'none.png'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('起動できません')
  })

  it('出力が書かれないままなら timeoutMs で打ち切って失敗を返す', async () => {
    const result = await runChrome(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      path.join(base, 'none.png'),
      1000,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('タイムアウト')
  }, 15_000)
})
