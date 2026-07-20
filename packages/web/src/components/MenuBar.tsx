/**
 * グローバルヘッダのメニューバー([ファイル]・[編集]・[表示]・[ヘルプ])。
 * クリックで開閉し、外側クリック・Esc で閉じる。キーボード操作に対応する
 * (←/→ でメニュー移動、↑/↓ で項目移動、Enter/Space で実行、Esc で閉じる)。
 * データ駆動(menus 配列)で描画し、項目の種類は
 * action / checkbox / radio / link / separator / submenu(1 階層のみ)。
 * submenu はホバーまたはクリック・→ キーで開き、← / Esc で親項目へ戻る。
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

/** サブメニューに入れられる末端の項目。separator 以外は選択で発火する */
export type MenuLeafItem =
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
  | {
      kind: 'link'
      label: string
      /** 新規タブで開くリンク先(例: GitHub リポジトリ) */
      href: string
    }
  | { kind: 'separator' }

/** メニュー項目。submenu のネストは 1 階層のみ(型で強制する) */
export type MenuItem =
  | MenuLeafItem
  | {
      kind: 'submenu'
      label: string
      items: MenuLeafItem[]
    }

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

/** リストのキー(separator はラベルを持たないため index で補う) */
function itemKeyOf(item: MenuItem, index: number): string {
  return item.kind === 'separator' ? `sep-${index}` : item.label
}

interface MenuLeafProps {
  item: MenuLeafItem
  /** ロービングフォーカスの対象(その項目だけ tabIndex 0)か */
  tabbable: boolean
  itemRef: (el: HTMLButtonElement | HTMLAnchorElement | null) => void
  /** ボタン項目(action / checkbox / radio)の選択 */
  onActivate: () => void
  /** link クリック後の後始末(メニューを閉じてトリガーへフォーカス) */
  onLinkSelect: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onMouseEnter?: () => void
}

/**
 * 末端項目(action / checkbox / radio / link / separator)の描画。
 * 親メニュー直下とサブメニューの両方から同じ見た目・挙動で使う。
 */
function MenuLeaf({
  item,
  tabbable,
  itemRef,
  onActivate,
  onLinkSelect,
  onKeyDown,
  onMouseEnter,
}: MenuLeafProps) {
  if (item.kind === 'separator') {
    return <div className="menubar-separator" role="separator" />
  }
  if (item.kind === 'link') {
    // 外部リンクは <a> で表現し、新規タブで開く。Enter は
    // アンカーの既定動作で発火するので onKeyDown は素通しでよい。
    return (
      <a
        className="menubar-item"
        role="menuitem"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={tabbable ? 0 : -1}
        ref={itemRef}
        onClick={onLinkSelect}
        onKeyDown={onKeyDown}
        onMouseEnter={onMouseEnter}
      >
        <span className="menubar-check" aria-hidden="true" />
        <span className="menubar-label">{item.label}</span>
        <span className="menubar-shortcut" aria-hidden="true">
          ↗
        </span>
      </a>
    )
  }
  const checked = item.kind !== 'action' ? item.checked : undefined
  const disabled = item.kind === 'action' && item.disabled
  const shortcut = item.kind === 'action' ? item.shortcut : undefined
  const role =
    item.kind === 'checkbox'
      ? 'menuitemcheckbox'
      : item.kind === 'radio'
        ? 'menuitemradio'
        : 'menuitem'
  return (
    <button
      type="button"
      className="menubar-item"
      role={role}
      disabled={disabled}
      aria-checked={checked}
      tabIndex={tabbable ? 0 : -1}
      ref={itemRef}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
    >
      <span className="menubar-check" aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span className="menubar-label">{item.label}</span>
      {shortcut ? <span className="menubar-shortcut">{shortcut}</span> : null}
    </button>
  )
}

function MenuBar({ menus }: MenuBarProps) {
  // 開いているメニューの index(null なら閉じている)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // 開いているメニュー内でフォーカス中の項目 index(-1 はマウス操作で未指定)
  const [activeItem, setActiveItem] = useState(-1)
  // 開いているサブメニューの親項目 index(null なら閉じている)
  const [openSub, setOpenSub] = useState<number | null>(null)
  // 開いているサブメニュー内でフォーカス中の項目 index(-1 はマウス操作で未指定)
  const [activeSubItem, setActiveSubItem] = useState(-1)

  const barRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([])
  const itemRefs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>([])
  const subItemRefs = useRef<(HTMLButtonElement | HTMLAnchorElement | null)[]>(
    [],
  )

  // 外側クリック・スクロールで閉じる
  useEffect(() => {
    if (openIndex === null) return
    const onPointer = (event: MouseEvent): void => {
      if (!barRef.current?.contains(event.target as Node)) {
        setOpenIndex(null)
        setOpenSub(null)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [openIndex])

  // キーボードで開いたときは対象項目へフォーカスを移す
  // (サブメニューが開いていればその項目を、なければ親メニューの項目を優先する)
  useEffect(() => {
    if (openIndex === null) return
    if (openSub !== null && activeSubItem >= 0) {
      subItemRefs.current[activeSubItem]?.focus()
    } else if (openSub === null && activeItem >= 0) {
      itemRefs.current[activeItem]?.focus()
    }
  }, [openIndex, activeItem, openSub, activeSubItem])

  const closeSubmenu = (): void => {
    setOpenSub(null)
    setActiveSubItem(-1)
  }

  const closeAndFocusTrigger = (index: number): void => {
    setOpenIndex(null)
    setActiveItem(-1)
    closeSubmenu()
    triggerRefs.current[index]?.focus()
  }

  /** メニュー内で選択可能な次/前の項目 index を返す(端で折り返す) */
  const stepItem = (
    items: readonly MenuItem[],
    from: number,
    dir: 1 | -1,
  ): number => {
    const n = items.length
    for (let i = 1; i <= n; i += 1) {
      const idx = (((from + dir * i) % n) + n) % n
      if (isSelectable(items[idx])) return idx
    }
    return from
  }

  const firstSelectable = (items: readonly MenuItem[]): number =>
    items.findIndex(isSelectable)

  const openMenu = (index: number, focusItem: boolean): void => {
    setOpenIndex(index)
    setActiveItem(focusItem ? firstSelectable(menus[index].items) : -1)
    closeSubmenu()
  }

  const openSubmenuAt = (
    itemIndex: number,
    focusItem: boolean,
    items: MenuLeafItem[],
  ): void => {
    setOpenSub(itemIndex)
    setActiveSubItem(focusItem ? firstSelectable(items) : -1)
  }

  const activate = (index: number, item: MenuLeafItem): void => {
    // separator / link はボタンの activate 経路を通らない(link はアンカーの
    // 既定動作で開く)。型の網羅性のためにも早期 return しておく。
    if (item.kind === 'separator' || item.kind === 'link') return
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
        closeSubmenu()
        break
    }
  }

  const onItemKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    index: number,
    itemIndex: number,
    item: MenuItem,
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
      case 'Enter':
      case ' ':
        // submenu 項目はボタンの click ではなくここで開く(最初の項目へフォーカス)
        if (item.kind === 'submenu') {
          event.preventDefault()
          openSubmenuAt(itemIndex, true, item.items)
        }
        break
      case 'ArrowRight': {
        event.preventDefault()
        if (item.kind === 'submenu') {
          openSubmenuAt(itemIndex, true, item.items)
        } else {
          openMenu((index + 1) % menus.length, true)
        }
        break
      }
      case 'ArrowLeft': {
        event.preventDefault()
        openMenu((index - 1 + menus.length) % menus.length, true)
        break
      }
      case 'Tab':
        setOpenIndex(null)
        setActiveItem(-1)
        closeSubmenu()
        break
    }
  }

  const onSubItemKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    index: number,
    parentIndex: number,
    items: MenuLeafItem[],
  ): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveSubItem((cur) => stepItem(items, cur < 0 ? -1 : cur, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveSubItem((cur) => stepItem(items, cur < 0 ? 0 : cur, -1))
        break
      case 'ArrowLeft':
      case 'Escape':
        // サブメニューだけ閉じて親項目へ戻る(メニュー全体は開いたまま)
        event.preventDefault()
        closeSubmenu()
        setActiveItem(parentIndex)
        break
      case 'ArrowRight':
        event.preventDefault()
        openMenu((index + 1) % menus.length, true)
        break
      case 'Tab':
        setOpenIndex(null)
        setActiveItem(-1)
        closeSubmenu()
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
                  if (item.kind === 'submenu') {
                    const subOpen = openSub === itemIndex
                    return (
                      <div key={item.label} className="menubar-submenu-wrap">
                        <button
                          type="button"
                          className={`menubar-item${subOpen ? ' submenu-open' : ''}`}
                          role="menuitem"
                          aria-haspopup="menu"
                          aria-expanded={subOpen}
                          tabIndex={activeItem === itemIndex ? 0 : -1}
                          ref={(el) => {
                            itemRefs.current[itemIndex] = el
                          }}
                          // ホバーで先に開くため、クリックはトグルではなく
                          // 常に開くにする(閉じるのは他項目ホバー・Esc・選択で行う)
                          onClick={() =>
                            openSubmenuAt(itemIndex, false, item.items)
                          }
                          onMouseEnter={() =>
                            openSubmenuAt(itemIndex, false, item.items)
                          }
                          onKeyDown={(event) =>
                            onItemKeyDown(event, index, itemIndex, item)
                          }
                        >
                          <span className="menubar-check" aria-hidden="true" />
                          <span className="menubar-label">{item.label}</span>
                          <span className="menubar-shortcut" aria-hidden="true">
                            ▸
                          </span>
                        </button>
                        {subOpen ? (
                          <div
                            className="menubar-dropdown menubar-submenu"
                            role="menu"
                          >
                            {item.items.map((sub, subIndex) => (
                              <MenuLeaf
                                key={itemKeyOf(sub, subIndex)}
                                item={sub}
                                tabbable={activeSubItem === subIndex}
                                itemRef={(el) => {
                                  subItemRefs.current[subIndex] = el
                                }}
                                onActivate={() => activate(index, sub)}
                                onLinkSelect={() => closeAndFocusTrigger(index)}
                                onKeyDown={(event) =>
                                  onSubItemKeyDown(
                                    event,
                                    index,
                                    itemIndex,
                                    item.items,
                                  )
                                }
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  }
                  return (
                    <MenuLeaf
                      key={itemKeyOf(item, itemIndex)}
                      item={item}
                      tabbable={activeItem === itemIndex}
                      itemRef={(el) => {
                        itemRefs.current[itemIndex] = el
                      }}
                      onActivate={() => activate(index, item)}
                      onLinkSelect={() => closeAndFocusTrigger(index)}
                      onKeyDown={(event) =>
                        onItemKeyDown(event, index, itemIndex, item)
                      }
                      // 別の項目に触れたら開いているサブメニューを閉じる
                      onMouseEnter={openSub !== null ? closeSubmenu : undefined}
                    />
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
