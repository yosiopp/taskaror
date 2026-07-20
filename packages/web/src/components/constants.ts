/**
 * 左タスクグリッドと右ガントチャートで共有するレイアウト定数。
 * ROW_HEIGHT / HEADER_HEIGHT を両ペインで揃えることで行位置を一致させる。
 *
 * DAY_WIDTH / ROW_HEIGHT / HEADER_HEIGHT / MONTH_BAND_HEIGHT は core の既定値
 * (レイアウト計算・SVG 出力と同じ値)を re-export し、CLI の svg 出力と見た目を揃える。
 */

export {
  /** 1 暦日あたりの px 幅(ガントの日カラム幅) */
  DEFAULT_DAY_WIDTH as DAY_WIDTH,
  /** 1 行あたりの px 高(グリッド行とガント行で共通) */
  DEFAULT_ROW_HEIGHT as ROW_HEIGHT,
} from '@taskaror/core/gantt'

export {
  /** ヘッダ(グリッドの列見出し / ガントの時間軸)の px 高 */
  DEFAULT_HEADER_HEIGHT as HEADER_HEIGHT,
  /** ガント時間軸ヘッダのうち月ラベル帯の px 高(残りが日ラベル帯) */
  DEFAULT_MONTH_BAND_HEIGHT as MONTH_BAND_HEIGHT,
} from '@taskaror/core/ganttSvg'

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
 * 広いときは名前列(1fr)が余白を吸収する。
 */
export const GRID_COLUMNS =
  'minmax(92px, 1fr) minmax(40px, 56px) minmax(88px, 128px) minmax(56px, 88px) minmax(36px, 56px) minmax(40px, 76px)'
