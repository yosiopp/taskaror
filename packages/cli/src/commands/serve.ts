// serve コマンド: ビルド済みの web(静的 SPA)をローカルサーバで配信する。
// web は静的なまま(spec の保持は localStorage とダウンロード/アップロード)のため、
// ファイルの直接編集やマウントは行わず、静的ファイルを返すだけの薄いサーバとする。
import { existsSync, realpathSync } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** ファイル不在系(フォールバック・404 の対象)のエラーコードか */
function isMissingError(err: unknown): boolean {
  return (
    isErrnoException(err) &&
    (err.code === 'ENOENT' || err.code === 'EISDIR' || err.code === 'ENOTDIR')
  )
}

/** 配信ルート。root は字句チェック用、realRoot は実体パス(シンボリックリンク解決済み) */
interface ServeRoots {
  root: string
  realRoot: string
}

/**
 * filePath の実ファイルを読み込んで応答する。
 * ファイル不在系(ENOENT / EISDIR / ENOTDIR)は応答せず 'missing' を返し、
 * index.html へのフォールバック判断は呼び出し側に委ねる。応答済みなら 'done'。
 */
async function serveFile(
  roots: ServeRoots,
  filePath: string,
  res: ServerResponse,
): Promise<'done' | 'missing'> {
  // 字句チェックだけではシンボリックリンク経由でルート外を参照できてしまうため、
  // 実体パスを解決してルート(実体)配下に収まっているかも検証する(多層防御)
  let realPath: string
  try {
    realPath = await realpath(filePath)
  } catch (err) {
    if (isMissingError(err)) return 'missing'
    respondText(res, 500, 'サーバ内部でエラーが発生しました')
    return 'done'
  }
  if (
    realPath !== roots.realRoot &&
    !realPath.startsWith(roots.realRoot + path.sep)
  ) {
    respondText(res, 403, '配信ルートの外にはアクセスできません')
    return 'done'
  }

  try {
    const body = await readFile(realPath)
    const type =
      CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
      'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(body)
    return 'done'
  } catch (err) {
    if (isMissingError(err)) return 'missing'
    respondText(res, 500, 'サーバ内部でエラーが発生しました')
    return 'done'
  }
}

/** 1 リクエストを処理する(createRequestHandler から呼ばれる本体) */
async function handleRequest(
  roots: ServeRoots,
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

  // NUL バイトを含むパスは不正としてファイルシステムに渡さない
  if (pathname.includes('\0')) {
    respondText(res, 400, '不正なリクエストパスです')
    return
  }

  // パストラバーサル防止: 解決後のパスが配信ルート配下に収まっているか検証する
  const filePath = path.resolve(roots.root, `.${pathname}`)
  if (filePath !== roots.root && !filePath.startsWith(roots.root + path.sep)) {
    respondText(res, 403, '配信ルートの外にはアクセスできません')
    return
  }

  // まず要求されたパスの実ファイルを試し、見つからず拡張子もないときだけ
  // SPA のルーティングとみなして index.html にフォールバックする
  const result = await serveFile(roots, filePath, res)
  if (result === 'done') return
  if (path.extname(filePath) === '') {
    const fallback = await serveFile(
      roots,
      path.join(roots.root, 'index.html'),
      res,
    )
    if (fallback === 'done') return
  }
  respondText(res, 404, 'ファイルが見つかりません')
}

/**
 * 配信ルート root 配下の静的ファイルを返すリクエストハンドラを生成する。
 * サーバ起動から分離してあり、テストからはこのハンドラだけを検証できる。
 */
export function createRequestHandler(
  root: string,
): (req: IncomingMessage, res: ServerResponse) => void {
  const resolvedRoot = path.resolve(root)
  // シンボリックリンク封じ込めの基準として、起動時に配信ルートの実体パスを解決しておく
  const roots: ServeRoots = {
    root: resolvedRoot,
    realRoot: realpathSync(resolvedRoot),
  }
  return (req, res) => {
    void handleRequest(roots, req, res)
  }
}

/** ホスト名を URL 表示用に整形する(IPv6 アドレスは [] で囲む) */
function formatHost(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

/**
 * bind 先ホストを決める(--host → 環境変数 TASKAROR_SERVE_HOST → ループバック)。
 * 空文字は「指定なし」とみなして次の候補へフォールバックする。
 */
export function resolveHost(hostOption: string | undefined): string {
  // 既定の bind 先は環境変数 TASKAROR_SERVE_HOST(Docker 実行用)、なければループバック
  return hostOption || process.env.TASKAROR_SERVE_HOST || '127.0.0.1'
}

/**
 * 自ファイルのディレクトリを返す。
 * esbuild で CJS にバンドルした実行時は __dirname(= dist/)が使える。
 * Vitest(ESM)からソースを直接実行する場合は import.meta.url(= src/commands/)から求める。
 */
function ownDir(): string {
  return typeof __dirname === 'string'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))
}

/** serve の使い方(ヘルプ)の文面 */
function serveUsage(): string {
  return [
    '使い方: taskaror serve [オプション]',
    '',
    'ビルド済みの web(GUI エディタ)をローカルサーバで配信する。',
    '',
    'オプション:',
    `  --port <番号>    待ち受けポート(既定: ${DEFAULT_PORT})`,
    '  --host <ホスト>  bind 先ホスト(既定: 127.0.0.1)',
    '  -h, --help       この使い方を表示する',
    '',
    '環境変数:',
    '  TASKAROR_SERVE_HOST  --host 省略時の bind 先(Docker 実行用)',
  ].join('\n')
}

/** serve コマンド本体。終了コードを返す(正常起動中は解決しない) */
async function runServe(argv: string[]): Promise<number> {
  let values: { port?: string; host?: string; help?: boolean }
  try {
    values = parseArgs({
      args: argv,
      options: {
        port: { type: 'string' },
        host: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values
  } catch (err) {
    console.error(
      `エラー: serve のオプションを解釈できません(${err instanceof Error ? err.message : String(err)})`,
    )
    return 2
  }
  if (values.help === true) {
    console.log(serveUsage())
    return 0
  }

  const portStr = values.port ?? String(DEFAULT_PORT)
  // 10 進数の数字列だけを受け付ける(空文字・16 進表記・指数表記は拒否)
  if (!/^\d+$/.test(portStr)) {
    console.error(
      `エラー: --port には 0〜65535 の整数を指定してください: ${portStr}`,
    )
    return 2
  }
  const port = Number(portStr)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(
      `エラー: --port には 0〜65535 の整数を指定してください: ${portStr}`,
    )
    return 2
  }
  const host = resolveHost(values.host)

  // バンドル(dist/taskaror.cjs)から見た dist/web が配信ルート
  const webRoot = path.join(ownDir(), 'web')
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
