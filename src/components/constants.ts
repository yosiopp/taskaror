/**
 * 左タスクグリッドと右ガントチャートで共有するレイアウト定数。
 * ROW_HEIGHT / HEADER_HEIGHT を両ペインで揃えることで行位置を一致させる。
 */

/** 1 暦日あたりの px 幅(ガントの日カラム幅) */
export const DAY_WIDTH = 28

/** 1 行あたりの px 高(グリッド行とガント行で共通) */
export const ROW_HEIGHT = 34

/** ヘッダ(グリッドの列見出し / ガントの時間軸)の px 高 */
export const HEADER_HEIGHT = 48

/** ガント時間軸ヘッダのうち月ラベル帯の px 高(残りが日ラベル帯) */
export const MONTH_BAND_HEIGHT = 20

/**
 * ガント日カラム仮想化のオーバースキャン(可視範囲の前後に余分に描く日カラム数)。
 * スクロール中の再計算が間に合わなくても空白が見えないよう、少し広めに描く。
 */
export const GANTT_DAY_OVERSCAN = 12

/** 左タスクグリッドの既定幅(px)。ドラッグでの幅変更の初期値/フォールバック */
export const GRID_WIDTH = 560

/**
 * グリッドの列幅テンプレート(ヘッダ行と本文行で共有し、列を揃える)。
 * 各列を minmax(最小, 目安) にして、幅を狭めたときは目安から縮み、
 * 広いときは名前列(1fr)が余白を吸収する。既定幅では従来と同じ見え方になる。
 */
export const GRID_COLUMNS =
  'minmax(92px, 1fr) minmax(40px, 56px) minmax(88px, 128px) minmax(56px, 88px) minmax(36px, 56px) minmax(40px, 76px)'
