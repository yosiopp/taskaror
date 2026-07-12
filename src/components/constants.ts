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

/** 左タスクグリッドの固定幅(px) */
export const GRID_WIDTH = 560

/** グリッドの列幅テンプレート(ヘッダ行と本文行で共有し、列を揃える) */
export const GRID_COLUMNS = 'minmax(140px, 1fr) 56px 128px 88px 56px 76px'
