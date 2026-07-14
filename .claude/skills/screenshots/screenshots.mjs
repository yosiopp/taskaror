// taskaror の 3 ビュー(ガント / WBS表 / YAML)のスクリーンショットを撮る。
// 使い方: node .claude/skills/screenshots/screenshots.mjs [出力先ディレクトリ]
// システムの Google Chrome を playwright-core の channel 指定で使う(ブラウザ DL 不要)。
// 前提や目視確認のチェックリストは同ディレクトリの SKILL.md を参照。
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.TASKAROR_SHOTS_URL ?? 'http://localhost:5173/'
const outDir = path.resolve(process.argv[2] ?? 'shots')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({
  // 既存画像とサイズを揃える(docs/site/docs/images は 1440x640・1x)
  viewport: { width: 1440, height: 640 },
  deviceScaleFactor: 1,
})

await page.goto(BASE, { waitUntil: 'networkidle' })
// サンプル spec(ECサイト構築)が読み込まれてグリッドが描画されるのを待つ
await page.getByText('API設計').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outDir, 'screenshot-gantt.png') })

// 表示メニュー → WBS表
await page.getByRole('menuitem', { name: '表示' }).click()
await page.getByRole('menuitemradio', { name: 'WBS表' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outDir, 'screenshot-wbs.png') })

// 表示メニュー → YAML
await page.getByRole('menuitem', { name: '表示' }).click()
await page.getByRole('menuitemradio', { name: 'YAML' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: path.join(outDir, 'screenshot-yaml.png') })

await browser.close()
console.log(`撮影完了: ${outDir}`)
