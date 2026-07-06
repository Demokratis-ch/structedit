/**
 * Platform detection and keyboard-modifier labels, shared across the UI so key
 * hints read natively per-OS: Mac shows the glyph shortcuts (⌘ ⌥ ⇧), everything
 * else spells them out with a trailing `+` (`Ctrl+`, `Alt+`, `Shift+`).
 */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? '');

/** The Cmd/Ctrl modifier: `⌘` on Mac, `Ctrl+` elsewhere. */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+';
/** The Alt/Option modifier: `⌥` on Mac, `Alt+` elsewhere. */
export const ALT = IS_MAC ? '⌥' : 'Alt+';
/** The Shift modifier: `⇧` on Mac, `Shift+` elsewhere. */
export const SHIFT = IS_MAC ? '⇧' : 'Shift+';
