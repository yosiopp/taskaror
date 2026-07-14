// GitHub Pages(https://yosiopp.github.io/taskaror/)で公開する利用者向けドキュメントの
// Rspress 設定。コンテンツは docs/ 配下、デプロイは .github/workflows/pages.yml が行う。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'rspress/config'

// モノレポのルートには web 用の React 19 が hoist されており、React 18 前提の
// rspress では react / react-dom / react-helmet-async が @rspress/* 配下に
// 重複配置されてしまう(Helmet の Context が二重化して SSG が壊れる)。
// このワークスペース直下の単一コピーへ alias で寄せて重複を解消する。
const dirname = path.dirname(fileURLToPath(import.meta.url))
const local = (pkg: string) => path.join(dirname, 'node_modules', pkg)

export default defineConfig({
  root: 'docs',
  base: '/taskaror/',
  title: 'taskaror',
  // web(GUI エディタ)と同じファビコン(docs/public/favicon.svg)
  icon: '/favicon.svg',
  description:
    'YAML ベースのタスク定義フォーマット TaskSpec のエディタ・ツール群',
  route: {
    // /taskspec.html ではなく /taskspec 形式の URL で公開する
    cleanUrls: true,
  },
  builderConfig: {
    resolve: {
      alias: {
        react: local('react'),
        'react-dom': local('react-dom'),
        'react-helmet-async': local('react-helmet-async'),
      },
    },
  },
  themeConfig: {
    // 組み込みの全文検索(flexsearch)は日本語の分かち書きに対応していないため無効化する
    search: false,
    outlineTitle: '目次',
    prevPageText: '前のページ',
    nextPageText: '次のページ',
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/yosiopp/taskaror',
      },
    ],
  },
})
