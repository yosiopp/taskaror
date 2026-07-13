import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequestHandler } from './serve'

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
  await writeFile(path.join(base, 'secret.txt'), '配信してはいけない内容')

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
})
