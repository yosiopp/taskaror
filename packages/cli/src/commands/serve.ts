// serve コマンド: ビルド済みの web(静的 SPA)をローカルサーバで配信する。
// web は静的なまま(spec の保持は localStorage とダウンロード/アップロード)のため、
// ファイルの直接編集やマウントは行わず、静的ファイルを返すだけの薄いサーバとする。
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { Command } from '../cli'

/** 既定の待ち受けポート */
const DEFAULT_PORT = 5173

/** 拡張子 → Content-Type の対応表 */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

/** プレーンテキストでステータスとメッセージを返す */
function respondText(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(`${message}\n`)
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}

/** 1 リクエストを処理する(createRequestHandler から呼ばれる本体) */
async function handleRequest(
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let pathname: string
  try {
    // クエリ・フラグメントを除いたパス部分を取り出してデコードする
    pathname = decodeURIComponent(
      new URL(req.url ?? '/', 'http://localhost').pathname,
    )
  } catch {
    respondText(res, 400, '不正なリクエストパスです')
    return
  }

  // パストラバーサル防止: 解決後のパスが配信ルート配下に収まっているか検証する
  const filePath = path.resolve(root, `.${pathname}`)
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    respondText(res, 403, '配信ルートの外にはアクセスできません')
    return
  }

  // 拡張子のないパスは SPA のルーティングとみなして index.html にフォールバックする
  const target =
    path.extname(filePath) === '' ? path.join(root, 'index.html') : filePath

  try {
    const body = await readFile(target)
    const type =
      CONTENT_TYPES[path.extname(target).toLowerCase()] ??
      'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(body)
  } catch (err) {
    if (
      isErrnoException(err) &&
      (err.code === 'ENOENT' || err.code === 'EISDIR' || err.code === 'ENOTDIR')
    ) {
      respondText(res, 404, 'ファイルが見つかりません')
    } else {
      respondText(res, 500, 'サーバ内部でエラーが発生しました')
    }
  }
}

/**
 * 配信ルート root 配下の静的ファイルを返すリクエストハンドラを生成する。
 * サーバ起動から分離してあり、テストからはこのハンドラだけを検証できる。
 */
export function createRequestHandler(
  root: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  const resolvedRoot = path.resolve(root)
  return (req, res) => {
    void handleRequest(resolvedRoot, req, res)
  }
}

/** ホスト名を URL 表示用に整形する(IPv6 アドレスは [] で囲む) */
function formatHost(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

/** serve コマンド本体。終了コードを返す(正常起動中は解決しない) */
async function runServe(argv: string[]): Promise<number> {
  let values: { port?: string; host?: string }
  try {
    values = parseArgs({
      args: argv,
      options: {
        port: { type: 'string' },
        host: { type: 'string' },
      },
    }).values
  } catch (err) {
    console.error(
      `エラー: serve のオプションを解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }

  const portStr = values.port ?? String(DEFAULT_PORT)
  const port = Number(portStr)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(
      `エラー: --port には 0〜65535 の整数を指定してください: ${portStr}`,
    )
    return 2
  }
  // 既定の bind 先は環境変数 TASKAROR_SERVE_HOST(Docker 実行用)、なければループバック
  const host = values.host ?? process.env.TASKAROR_SERVE_HOST ?? '127.0.0.1'

  // バンドル(dist/taskaror.cjs)から見た dist/web が配信ルート
  const webRoot = path.join(__dirname, 'web')
  if (!existsSync(path.join(webRoot, 'index.html'))) {
    console.error(
      'エラー: 配信する web のビルド成果物(dist/web)が見つかりません。',
    )
    console.error(
      'リポジトリルートで `npm run build` を実行してから再度お試しください。',
    )
    return 2
  }

  const server = createServer(createRequestHandler(webRoot))
  return await new Promise<number>((resolve) => {
    server.on('error', (err) => {
      console.error(`エラー: サーバを起動できません(${err.message})`)
      resolve(1)
    })
    server.listen(port, host, () => {
      const address = server.address()
      const actualPort =
        typeof address === 'object' && address !== null ? address.port : port
      console.log(
        `taskaror web を配信中: http://${formatHost(host)}:${actualPort}/(Ctrl+C で停止)`,
      )
    })
  })
}

/** ディスパッチ(cli.ts のレジストリ)に登録するコマンド定義 */
export const serveCommand: Command = {
  description: 'web(GUI エディタ)をローカルサーバで配信する',
  run: runServe,
}
