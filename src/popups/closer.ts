// Which elements of an MPMB dialog the app draws, and which closing buttons go to the bottom bar.
import type { DialogElement } from '../engine/host.ts';

/**
 * Acrobat keeps an element with this alignment out of sight: MPMB adds such a hidden ok/cancel pair
 * next to its visible "Close" so that Enter and Esc work. Here Esc is the modal's own, so it isn't drawn.
 */
const OFFSCREEN = 'align_offscreen';

/**
 * MPMB's focus catcher: a read-only text field of 1 × 1 point ("ding") next to a long text, so that
 * Acrobat doesn't put the cursor into the text. Drawn here it was an empty box.
 */
const isFocusCatcher = (element: DialogElement): boolean =>
  element.type === 'edit_text' &&
  element.readonly === true &&
  Number(element.width) <= 1 &&
  Number(element.height) <= 1;

/** Whether the app leaves an element out: Acrobat keeps it out of sight too, or it is only there for focus. */
export const isUnseen = (element: DialogElement): boolean => element.alignment === OFFSCREEN || isFocusCatcher(element);

/** The element types that stand for the dialog's closing buttons (OK, Cancel, Other). */
const CLOSERS = ['ok', 'ok_cancel', 'ok_cancel_other'];

/**
 * The dialog's visible closing buttons, which go to the bottom bar so they stay in view when a long
 * dialog scrolls. MPMB has one such element per dialog, usually last; off-screen ones don't count.
 */
export function findCloser(elements: DialogElement[] = []): DialogElement | undefined {
  return elements.reduce<DialogElement | undefined>((found, e) => {
    if (found || isUnseen(e)) return found;
    return CLOSERS.includes(e.type ?? '') ? e : findCloser(e.elements);
  }, undefined);
}
