// taskaror CLI のビルドスクリプト。
// esbuild で src/main.ts を単一の CJS ファイル dist/taskaror.cjs にバンドルする。
// - 配布物のランタイム依存をゼロにするため、@taskaror/core などの依存はすべてバンドルに内包する
// - CJS 出力にするのは、ajv 等の CJS 依存の interop を安全にするため
import { build } from 'esbuild'
import { chmodSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outfile = path.join(pkgDir, 'dist', 'taskaror.cjs')

await build({
  entryPoints: [path.join(pkgDir, 'src', 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // npm の bin として直接実行できるように shebang を付与する
  banner: { js: '#!/usr/bin/env node' },
  // __dirname が使えない環境(Vitest / ESM)向けのフォールバックで import.meta を参照しているが、
  // CJS バンドルの実行時は必ず __dirname 側が使われるため、この警告は抑止する
  logOverride: { 'empty-import-meta': 'silent' },
})

// npx / npm の bin から直接実行できるように実行権限を付与する(esbuild は 644 で出力する)
chmodSync(outfile, 0o755)
