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
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequestHandler, resolveHost, serveCommand } from './serve'

/** レスポンスの要約(検証に使う分だけ) */
interface Response {
  status: number
  contentType: string | undefined
  body: string
}

// 一時ディレクトリのフィクスチャ:
//   <base>/web/        … 配信ルート
//   <base>/secret.txt  … 配信ルートの外(トラバーサル検証用)
let base: string
let server: Server
let origin: string

/**
 * 生のパスで GET する。fetch は `..` などをクライアント側で正規化してしまうため、
 * パストラバーサルの検証も含めて node:http の request を直接使う。
 */
function get(rawPath: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${rawPath}`, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          contentType: res.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf-8'),
        }),
      )
    })
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'taskaror-serve-'))
  const root = path.join(base, 'web')
  await mkdir(path.join(root, 'assets'), { recursive: true })
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><title>taskaror</title><p>SPA 本体</p>',
  )
  await writeFile(path.join(root, 'assets', 'app.js'), 'console.log("ok")')
  await writeFile(
    path.join(root, 'favicon.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  )
  await writeFile(path.join(root, 'sample.yaml'), "taskspec: '1.0'")
  await writeFile(path.join(root, 'healthz'), '拡張子なしの実ファイル')
  await writeFile(path.join(base, 'secret.txt'), '配信してはいけない内容')
  // シンボリックリンク封じ込めの検証用: 配信ルート内から外のファイルを指すリンク
  await symlink(path.join(base, 'secret.txt'), path.join(root, 'leak.txt'))
  await symlink(path.join(base, 'secret.txt'), path.join(root, 'leak'))

  server = createServer(createRequestHandler(root))
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address !== 'object') {
    throw new Error('テスト用サーバのアドレスを取得できません')
  }
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  await rm(base, { recursive: true, force: true })
})

describe('createRequestHandler(静的配信)', () => {
  it('通常ファイルを Content-Type 付きで返す', async () => {
    const res = await get('/assets/app.js')
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('text/javascript; charset=utf-8')
    expect(res.body).toContain('console.log("ok")')
  })

  it('ルート(/)は index.html を返す', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('text/html; charset=utf-8')
    expect(res.body).toContain('SPA 本体')
  })

  it('拡張子のないパスは index.html にフォールバックする(SPA)', async () => {
    const res = await get('/some/deep/route')
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('text/html; charset=utf-8')
    expect(res.body).toContain('SPA 本体')
  })

  it('拡張子付きで存在しないパスは 404 を返す', async () => {
    const res = await get('/missing.js')
    expect(res.status).toBe(404)
  })

  it('配信ルート外へのパストラバーサルを拒否する', async () => {
    // %2f は URL 正規化で消えないため、デコード後に ../ となる形で検証する
    const res = await get('/..%2fsecret.txt')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('配信してはいけない内容')
  })

  it('多段のパストラバーサルも拒否する', async () => {
    const res = await get('/assets/..%2f..%2f..%2fsecret.txt')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('配信してはいけない内容')
  })

  it('拡張子に応じた Content-Type を返す(svg / yaml)', async () => {
    const svg = await get('/favicon.svg')
    expect(svg.status).toBe(200)
    expect(svg.contentType).toBe('image/svg+xml')

    const yaml = await get('/sample.yaml')
    expect(yaml.status).toBe(200)
    expect(yaml.contentType).toBe('application/yaml; charset=utf-8')
  })

  it('クエリ文字列を無視してファイルを返す', async () => {
    const res = await get('/assets/app.js?v=123')
    expect(res.status).toBe(200)
    expect(res.body).toContain('console.log("ok")')
  })

  it('NUL バイトを含むパスは 400 を返す', async () => {
    const res = await get('/index.html%00.js')
    expect(res.status).toBe(400)
  })

  it('拡張子のない実ファイルは index.html でなくそのまま配信する', async () => {
    const res = await get('/healthz')
    expect(res.status).toBe(200)
    expect(res.contentType).toBe('application/octet-stream')
    expect(res.body).toContain('拡張子なしの実ファイル')
  })

  it('配信ルート外を指すシンボリックリンクは 403 を返す', async () => {
    const res = await get('/leak.txt')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('配信してはいけない内容')
  })

  it('拡張子のないシンボリックリンクも index.html へフォールバックせず 403 を返す', async () => {
    const res = await get('/leak')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('配信してはいけない内容')
  })
})

// serve コマンド本体(オプション解釈)の出力を捕捉するためのスパイ
let logSpy: MockInstance
let errorSpy: MockInstance

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** スパイに渡された全出力を 1 つの文字列に結合する */
function joined(spy: MockInstance): string {
  return spy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n')
}

describe('serve コマンド(オプション解釈)', () => {
  it.each([[''], ['0x50'], ['1e3'], ['abc'], ['-1']])(
    '--port %j は 10 進数の整数でないため 2 を返す',
    async (portStr) => {
      const code = await serveCommand.run([`--port=${portStr}`])
      expect(code).toBe(2)
      expect(joined(errorSpy)).toContain('--port には 0〜65535 の整数')
    },
  )

  it('--port の範囲外(65536)は 2 を返す', async () => {
    const code = await serveCommand.run(['--port', '65536'])
    expect(code).toBe(2)
    expect(joined(errorSpy)).toContain('--port には 0〜65535 の整数')
  })

  it.each([['--help'], ['-h']])(
    '%s で serve の使い方を表示して 0 を返す',
    async (flag) => {
      const code = await serveCommand.run([flag])
      expect(code).toBe(0)
      const output = joined(logSpy)
      expect(output).toContain('使い方: taskaror serve')
      expect(output).toContain('TASKAROR_SERVE_HOST')
    },
  )
})

describe('resolveHost(bind 先の決定)', () => {
  it('--host の指定を最優先する', () => {
    vi.stubEnv('TASKAROR_SERVE_HOST', '0.0.0.0')
    expect(resolveHost('::1')).toBe('::1')
  })

  it('--host が空文字なら環境変数へフォールバックする', () => {
    vi.stubEnv('TASKAROR_SERVE_HOST', '0.0.0.0')
    expect(resolveHost('')).toBe('0.0.0.0')
  })

  it('環境変数も空文字ならループバックへフォールバックする', () => {
    vi.stubEnv('TASKAROR_SERVE_HOST', '')
    expect(resolveHost('')).toBe('127.0.0.1')
  })

  it('どちらも未指定ならループバックを返す', () => {
    vi.stubEnv('TASKAROR_SERVE_HOST', undefined)
    expect(resolveHost(undefined)).toBe('127.0.0.1')
  })
})
