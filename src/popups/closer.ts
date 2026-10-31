// Which elements of an MPMB dialog the app draws, and which closing buttons go to the bottom bar.
import type { DialogElement } from '../engine/host.ts';

/**
 * Acrobat keeps an element with this alignment out of sight: MPMB adds such a hidden ok/cancel pair
 * next to its visible "Close" so that Enter and Esc work. Here Esc is the modal's own, so it isn't drawn.
 */
const OFFSCREEN = 'align_offscreen';

export const isOffscreen = (element: DialogElement): boolean => element.alignment === OFFSCREEN;

/** The element types that stand for the dialog's closing buttons (OK, Cancel, Other). */
const CLOSERS = ['ok', 'ok_cancel', 'ok_cancel_other'];

/**
 * The dialog's visible closing buttons, which go to the bottom bar so they stay in view when a long
 * dialog scrolls. MPMB has one such element per dialog, usually last; off-screen ones don't count.
 */
export function findCloser(elements: DialogElement[] = []): DialogElement | undefined {
  return elements.reduce<DialogElement | undefined>((found, e) => {
    if (found || isOffscreen(e)) return found;
    return CLOSERS.includes(e.type ?? '') ? e : findCloser(e.elements);
  }, undefined);
}
