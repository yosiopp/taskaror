/**
 * グローバルヘッダのメニューバー([ファイル]・[編集]・[表示])。
 * クリックで開閉し、外側クリック・Esc で閉じる。キーボード操作に対応する
 * (←/→ でメニュー移動、↑/↓ で項目移動、Enter/Space で実行、Esc で閉じる)。
 * データ駆動(menus 配列)で描画し、項目の種類は action / checkbox / radio / separator。
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

/** メニュー項目。separator 以外は選択で発火する */
export type MenuItem =
  | {
      kind: 'action'
      label: string
      onSelect: () => void
      disabled?: boolean
      /** ショートカットキーの表示(例: 'Ctrl+Z')。動作は各画面側で実装する */
      shortcut?: string
    }
  | {
      kind: 'checkbox'
      label: string
      checked: boolean
      onSelect: () => void
    }
  | {
      kind: 'radio'
      label: string
      checked: boolean
      onSelect: () => void
    }
  | { kind: 'separator' }

export interface Menu {
  /** トップレベルのラベル(例: ファイル) */
  label: string
  items: MenuItem[]
}

export interface MenuBarProps {
  menus: Menu[]
}

/** その項目が選択可能(separator でなく、disabled でもない)か */
function isSelectable(item: MenuItem): boolean {
  return item.kind !== 'separator' && !(item.kind === 'action' && item.disabled)
}

function MenuBar({ menus }: MenuBarProps) {
  // 開いているメニューの index(null なら閉じている)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // 開いているメニュー内でフォーカス中の項目 index(-1 はマウス操作で未指定)
  const [activeItem, setActiveItem] = useState(-1)

  const barRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 外側クリック・スクロールで閉じる
  useEffect(() => {
    if (openIndex === null) return
    const onPointer = (event: MouseEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [openIndex])

  // キーボードで開いたときは対象項目へフォーカスを移す
  useEffect(() => {
    if (openIndex !== null && activeItem >= 0) {
      itemRefs.current[activeItem]?.focus()
    }
  }, [openIndex, activeItem])

  const closeAndFocusTrigger = (index: number): void => {
    setOpenIndex(null)
    setActiveItem(-1)
    triggerRefs.current[index]?.focus()
  }

  /** メニュー内で選択可能な次/前の項目 index を返す(端で折り返す) */
  const stepItem = (items: MenuItem[], from: number, dir: 1 | -1): number => {
    const n = items.length
    for (let i = 1; i <= n; i += 1) {
      const idx = (((from + dir * i) % n) + n) % n
      if (isSelectable(items[idx])) return idx
    }
    return from
  }

  const firstSelectable = (items: MenuItem[]): number =>
    items.findIndex(isSelectable)

  const openMenu = (index: number, focusItem: boolean): void => {
    setOpenIndex(index)
    setActiveItem(focusItem ? firstSelectable(menus[index].items) : -1)
  }

  const activate = (index: number, item: MenuItem): void => {
    if (item.kind === 'separator') return
    if (item.kind === 'action' && item.disabled) return
    item.onSelect()
    closeAndFocusTrigger(index)
  }

  const onTriggerKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault()
        openMenu(index, true)
        break
      case 'ArrowRight': {
        event.preventDefault()
        const next = (index + 1) % menus.length
        triggerRefs.current[next]?.focus()
        if (openIndex !== null) openMenu(next, false)
        break
      }
      case 'ArrowLeft': {
        event.preventDefault()
        const prev = (index - 1 + menus.length) % menus.length
        triggerRefs.current[prev]?.focus()
        if (openIndex !== null) openMenu(prev, false)
        break
      }
      case 'Escape':
        setOpenIndex(null)
        setActiveItem(-1)
        break
    }
  }

  const onItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void => {
    const items = menus[index].items
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveItem((cur) => stepItem(items, cur < 0 ? -1 : cur, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveItem((cur) => stepItem(items, cur < 0 ? 0 : cur, -1))
        break
      case 'Escape':
        event.preventDefault()
        closeAndFocusTrigger(index)
        break
      case 'ArrowRight': {
        event.preventDefault()
        const next = (index + 1) % menus.length
        openMenu(next, true)
        break
      }
      case 'ArrowLeft': {
        event.preventDefault()
        const prev = (index - 1 + menus.length) % menus.length
        openMenu(prev, true)
        break
      }
      case 'Tab':
        setOpenIndex(null)
        setActiveItem(-1)
        break
    }
  }

  return (
    <div className="menubar" role="menubar" ref={barRef}>
      {menus.map((menu, index) => {
        const open = openIndex === index
        return (
          <div key={menu.label} className="menubar-menu">
            <button
              type="button"
              className={`menubar-trigger${open ? ' open' : ''}`}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              ref={(el) => {
                triggerRefs.current[index] = el
              }}
              onClick={() =>
                open ? setOpenIndex(null) : openMenu(index, false)
              }
              onKeyDown={(event) => onTriggerKeyDown(event, index)}
            >
              {menu.label}
            </button>
            {open ? (
              <div className="menubar-dropdown" role="menu">
                {menu.items.map((item, itemIndex) => {
                  if (item.kind === 'separator') {
                    return (
                      <div
                        key={`sep-${itemIndex}`}
                        className="menubar-separator"
                        role="separator"
                      />
                    )
                  }
                  const checked =
                    item.kind !== 'action' ? item.checked : undefined
                  const disabled = item.kind === 'action' && item.disabled
                  const shortcut =
                    item.kind === 'action' ? item.shortcut : undefined
                  const role =
                    item.kind === 'checkbox'
                      ? 'menuitemcheckbox'
                      : item.kind === 'radio'
                        ? 'menuitemradio'
                        : 'menuitem'
                  return (
                    <button
                      key={item.label}
                      type="button"
                      className="menubar-item"
                      role={role}
                      disabled={disabled}
                      aria-checked={checked}
                      tabIndex={activeItem === itemIndex ? 0 : -1}
                      ref={(el) => {
                        itemRefs.current[itemIndex] = el
                      }}
                      onClick={() => activate(index, item)}
                      onKeyDown={(event) => onItemKeyDown(event, index)}
                    >
                      <span className="menubar-check" aria-hidden="true">
                        {checked ? '✓' : ''}
                      </span>
                      <span className="menubar-label">{item.label}</span>
                      {shortcut ? (
                        <span className="menubar-shortcut">{shortcut}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default MenuBar
