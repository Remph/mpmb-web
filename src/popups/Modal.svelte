<!--
  A modal window on the browser's <dialog>: it sits in the top layer, keeps focus inside, and Escape
  asks `onescape` instead of closing it, because every pop-up must answer the script waiting for it.
  The X in the top-right corner does the same as Escape.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    /** Escape and the X: the pop-up's "cancel" answer. */
    onescape: () => void;
    /** The X button's name for screen readers ("Close" in the current language). */
    closeLabel: string;
    /** Wide windows for lists (the sheet menu), narrow ones for questions. */
    wide?: boolean;
    /** MPMB's own dialogs: as wide as the screen allows, up to 72 rem. */
    widest?: boolean;
    children: Snippet;
    actions?: Snippet;
  }

  let { title, onescape, closeLabel, wide = false, widest = false, children, actions }: Props = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = `modal-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  function cancel(event: Event) {
    event.preventDefault();
    onescape();
  }

  /**
   * A second Escape without a click in between closes a modal <dialog> anyway (Firefox and Chromium
   * don't let a page hold it open). The pop-up stays until its script has an answer, so it opens
   * again; otherwise it would be gone while the script still waits for it. The cancel event before
   * this one already passed the Escape on to `onescape`.
   */
  function closed() {
    if (dialog?.isConnected && !dialog.open) dialog.showModal();
  }
</script>

<dialog bind:this={dialog} class:wide class:widest aria-labelledby={titleId} oncancel={cancel} onclose={closed}>
  <h2 id={titleId}>{title}</h2>
  <div class="body">
    {@render children()}
  </div>
  {#if actions}
    <div class="actions">
      {@render actions()}
    </div>
  {/if}
  <!--
    Last in the document so that opening the dialog still focuses the first field or menu entry, not
    the X; the grid puts it in the top-right corner, where people look for it.
  -->
  <button type="button" class="close" aria-label={closeLabel} title={closeLabel} onclick={onescape}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </button>
</dialog>

<style>
  dialog {
    width: min(30rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.3);
    /* The title row and buttons stay put; the body scrolls when the content is long. */
    display: grid;
    grid-template:
      'title close' auto
      'body body' minmax(0, 1fr)
      'actions actions' auto
      / minmax(0, 1fr) auto;
  }

  dialog:not([open]) {
    display: none;
  }

  dialog.wide {
    width: min(56rem, calc(100vw - 2rem));
  }

  /* MPMB's dialogs are laid out for Acrobat's wide windows; take what the screen offers. */
  dialog.widest {
    width: min(72rem, calc(100vw - 2rem));
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  h2 {
    grid-area: title;
    align-self: center;
    margin: 0;
    padding: 1rem 0.25rem 0.5rem 1.25rem;
    font-size: 1.125rem;
    line-height: 1.3;
  }

  .body {
    grid-area: body;
    padding: 0.25rem 1.25rem 1rem;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .actions {
    grid-area: actions;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid var(--line);
  }

  .close {
    grid-area: close;
    align-self: start;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: 0.375rem 0.375rem 0 0;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    background: var(--hover);
    color: var(--ink);
  }

  .close svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: round;
  }
</style>
