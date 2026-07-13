/**
 * 実行環境が提供するグローバル関数の最小型宣言。
 * core は DOM lib にも @types/node にも依存しないため(ブラウザ / Node 両対応)、
 * 使用するグローバルだけをここで宣言する。
 */

/** 構造化複製(Node 17+ / モダンブラウザで利用可能) */
declare function structuredClone<T>(value: T): T
