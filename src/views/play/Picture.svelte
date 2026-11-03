<!--
  One picture of the sheet (M8): the portrait, or the organisation symbol. The frame itself picks a file
  (a file input inside its label, so Safari on the iPad opens the picker from the tap); with a picture there,
  "Change" and "Remove" sit under it. A file the browser can't read leaves the picture as it was.
-->
<script lang="ts">
  import type { SheetImage } from '../../engine/types.ts';
  import type { Texts } from '../../i18n.ts';
  import { SAFE_PICTURE } from '../../play/pictures.ts';

  interface Props {
    image: SheetImage | undefined;
    /** What the frame is, for screen readers ("Portrait"). */
    label: string;
    /** The empty frame's text ("Add a picture"). */
    empty: string;
    /** The frame's name when it changes the picture ("Change portrait"). */
    change: string;
    /** Square for the symbol, 4:5 for the portrait (as on the PDF). */
    shape: 'portrait' | 'square';
    disabled: boolean;
    /** Puts the file on the sheet (null removes the picture); false when it couldn't be read. */
    set: (file: File | null) => Promise<boolean>;
    t: Texts;
  }

  let { image, label, empty, change, shape, disabled, set, t }: Props = $props();
  let failed = $state(false);
  let busy = $state(false);

  async function picked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Emptied, so the same file can be picked again after a failure.
    input.value = '';
    if (!file) return;
    busy = true;
    failed = !(await set(file));
    busy = false;
  }

  /** Only pictures the app made itself are shown (see SAFE_PICTURE). */
  const src = $derived(image && SAFE_PICTURE.test(image.src) ? image.src : '');
</script>

<div class="picture {shape}">
  <label class="frame" class:empty={!src} aria-label={src ? change : `${label}: ${empty}`}>
    <input type="file" accept="image/*" disabled={disabled || busy} onchange={picked} />
    {#if src}
      <img {src} alt={label} />
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true"
        ><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path
          d="M21 16l-5-5-8 8"
        /></svg
      >
      <span>{empty}</span>
    {/if}
  </label>
  {#if src}
    <div class="acts">
      <label class="button">
        <input type="file" accept="image/*" disabled={disabled || busy} onchange={picked} />
        {t.pictureChange}
      </label>
      <button type="button" class="quiet" disabled={disabled || busy} onclick={() => void set(null)}
        >{t.pictureRemove}</button
      >
    </div>
  {/if}
  {#if failed}<p class="failed" role="alert">{t.pictureFailed}</p>{/if}
</div>

<style>
  .picture {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  .frame {
    display: flex;
    position: relative;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--paper);
    color: var(--accent);
    font-weight: 700;
    text-align: center;
    cursor: pointer;
  }

  .portrait .frame {
    aspect-ratio: 4 / 5;
  }

  .square .frame {
    aspect-ratio: 1;
    font-size: 0.8125rem;
  }

  .frame.empty {
    padding: 0.5rem;
    border: 2px dashed var(--line);
  }

  .frame:has(input:focus-visible),
  .button:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .frame:has(input:disabled),
  .button:has(input:disabled) {
    cursor: default;
    opacity: 0.6;
  }

  .frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .frame svg {
    width: 2rem;
    height: 2rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
  }

  /* The file inputs stay in the page (Safari opens a picker only from a real input) but out of sight. */
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .acts {
    display: flex;
    gap: 0.375rem;
  }

  .button,
  .acts button {
    display: inline-flex;
    position: relative;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 0.9375rem;
    cursor: pointer;
  }

  .acts button.quiet {
    border-color: transparent;
    background: none;
    color: var(--ink-muted);
  }

  .failed {
    margin: 0;
    color: var(--danger);
    font-size: 0.875rem;
  }
</style>
