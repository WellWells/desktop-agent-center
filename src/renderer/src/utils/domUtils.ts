// src/renderer/src/utils/domUtils.ts

/** Returns true if the event target is a text input element, preventing global hotkeys from firing inside inputs. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}
