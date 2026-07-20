// Chrome / Chromium / Edge(Chromium 系ブラウザ)のヘッドレス実行まわりの共通処理。
// CLI はランタイム依存ゼロ方針のため、PNG / PDF への変換は npm パッケージではなく
// システムにインストール済みのブラウザをヘッドレス起動して行う(png / pdf コマンドで使う)。
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/** ブラウザ実行ファイルの探索結果。見つからない場合は利用者向けメッセージを持つ */
export type ChromeLookup =
  { ok: true; path: string } | { ok: false; message: string }

/** findChrome の探索条件。テストで環境を差し替えるためのパラメータ(通常は省略) */
export interface FindChromeOptions {
  env?: Record<string, string | undefined>
  platform?: NodeJS.Platform
  exists?: (filePath: string) => boolean
}

/** プラットフォームごとの既知のインストール先(絶対パス)の候補 */
function knownPaths(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): string[] {
  switch (platform) {
    case 'darwin':
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
    case 'win32': {
      const roots = [
        env.PROGRAMFILES,
        env['PROGRAMFILES(X86)'],
        env.LOCALAPPDATA,
      ]
      const candidates: string[] = []
      for (const root of roots) {
        if (root === undefined || root === '') continue
        candidates.push(
          path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        )
      }
      return candidates
    }
    default:
      return [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
        '/snap/bin/chromium',
      ]
  }
}

/** PATH から探すコマンド名の候補 */
function commandNames(platform: NodeJS.Platform): string[] {
  switch (platform) {
    case 'darwin':
      return ['google-chrome', 'chromium']
    case 'win32':
      return ['chrome.exe', 'msedge.exe']
    default:
      return [
        'google-chrome',
        'google-chrome-stable',
        'chromium',
        'chromium-browser',
        'microsoft-edge',
      ]
  }
}

/**
 * Chromium 系ブラウザの実行ファイルを探す。
 * 環境変数 TASKAROR_CHROME(明示指定)→ 既知のインストール先 → PATH の順。
 */
export function findChrome(options: FindChromeOptions = {}): ChromeLookup {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync

  const fromEnv = env.TASKAROR_CHROME
  if (fromEnv !== undefined && fromEnv !== '') {
    if (exists(fromEnv)) return { ok: true, path: fromEnv }
    return {
      ok: false,
      message: `環境変数 TASKAROR_CHROME のパスが見つかりません: ${fromEnv}`,
    }
  }

  for (const candidate of knownPaths(platform, env)) {
    if (exists(candidate)) return { ok: true, path: candidate }
  }
  const pathDirs = (env.PATH ?? '')
    .split(path.delimiter)
    .filter((dir) => dir !== '')
  for (const name of commandNames(platform)) {
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name)
      if (exists(candidate)) return { ok: true, path: candidate }
    }
  }
  return {
    ok: false,
    message:
      'Chrome / Chromium / Edge が見つかりません。' +
      'ブラウザをインストールするか、環境変数 TASKAROR_CHROME に実行ファイルのパスを指定してください',
  }
}

/** ブラウザのヘッドレス実行の結果。失敗時は利用者向けメッセージを持つ */
export type ChromeRunResult = { ok: true } | { ok: false; message: string }

/** ブラウザ起動処理の型。テストでは偽の実装を注入する */
export type ChromeRunner = (
  chromePath: string,
  args: string[],
  outFile: string,
  timeoutMs?: number,
) => Promise<ChromeRunResult>

/** ヘッドレス変換の待ち時間上限(ms)。巨大なガントの描画も考慮して長めにとる */
const CHROME_TIMEOUT_MS = 120_000
/** 出力ファイルの完成を監視する間隔(ms) */
const POLL_INTERVAL_MS = 200
/** 失敗時のヒントに添える stderr の長さ上限 */
const STDERR_LIMIT = 8192

/**
 * ブラウザをヘッドレス起動し、outFile(--screenshot / --print-to-pdf の出力先)が
 * 書き終わるまで待つ(ChromeRunner の既定実装)。
 * Chrome は環境によって変換後もプロセスが終了しないことがある(macOS の
 * Chrome 150 で確認)ため、プロセスの終了ではなく「出力ファイルが現れて
 * サイズが安定したこと」を成功条件とし、その時点でこちらから終了させる。
 */
export const runChrome: ChromeRunner = (
  chromePath,
  args,
  outFile,
  timeoutMs = CHROME_TIMEOUT_MS,
) =>
  new Promise((resolve) => {
    const child = spawn(chromePath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk.toString()
    })

    let settled = false
    const finish = (result: ChromeRunResult, kill: boolean): void => {
      if (settled) return
      settled = true
      clearInterval(poller)
      clearTimeout(timer)
      if (kill) child.kill('SIGKILL')
      resolve(result)
    }

    // 出力ファイルの完成(サイズが 2 回連続で同じ)を監視する
    let lastSize = -1
    const poller = setInterval(() => {
      let size: number
      try {
        size = statSync(outFile).size
      } catch {
        lastSize = -1
        return
      }
      if (size > 0 && size === lastSize) finish({ ok: true }, true)
      lastSize = size
    }, POLL_INTERVAL_MS)

    const timer = setTimeout(() => {
      finish(
        {
          ok: false,
          message: `実行がタイムアウトしました(${timeoutMs / 1000} 秒)`,
        },
        true,
      )
    }, timeoutMs)

    child.on('error', (err) => {
      finish({ ok: false, message: `起動できません(${err.message})` }, false)
    })
    child.on('exit', (code) => {
      // 自力で正常終了した場合も成功(出力の有無は呼び出し側が確認する)
      if (code === 0) {
        finish({ ok: true }, false)
        return
      }
      // stderr は長大になりがちなので末尾だけをヒントとして添える
      const stderrTail = stderr.trim().split('\n').slice(-3).join('\n')
      finish(
        {
          ok: false,
          message:
            `終了コード ${code}` + (stderrTail === '' ? '' : `\n${stderrTail}`),
        },
        false,
      )
    })
  })
