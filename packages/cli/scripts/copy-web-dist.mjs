// packages/web/dist(ビルド済みの静的 SPA)を packages/cli/dist/web へコピーする。
// `taskaror serve` はこのコピーを配信するため、cli のビルド時に必ず実行する
// (ルートの `npm run build` は web → cli の順にビルドしてこの前提を満たす)。
import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const src = path.resolve(pkgDir, '..', 'web', 'dist')
const dest = path.join(pkgDir, 'dist', 'web')

if (!existsSync(path.join(src, 'index.html'))) {
  console.error(
    'エラー: packages/web/dist が見つかりません(web が未ビルドです)。',
  )
  console.error(
    '先に `npm run build -w @taskaror/web` を実行するか、リポジトリルートで `npm run build` を実行してください。',
  )
  process.exit(2)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('packages/web/dist を packages/cli/dist/web へコピーしました')
