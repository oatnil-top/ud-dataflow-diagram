import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * True while a keydown belongs to an active IME composition (Chinese/Japanese/
 * Korean input). The Enter that confirms a candidate word must never trigger
 * send/submit/select actions.
 *
 * - `isComposing` covers Chrome/Firefox and most Safari cases.
 * - `keyCode === 229` covers Safari, which can dispatch the confirming Enter
 *   keydown after compositionend with `isComposing` already false, while still
 *   carrying the legacy 229 keyCode.
 */
export function isImeComposing(e: ReactKeyboardEvent | KeyboardEvent): boolean {
  const native: KeyboardEvent = 'nativeEvent' in e ? e.nativeEvent : e;
  return native.isComposing || native.keyCode === 229;
}
