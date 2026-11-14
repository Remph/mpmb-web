<!--
  A modal window on the browser's <dialog>: it sits in the top layer, keeps focus inside, and Escape
  asks `onescape` instead of closing it, because every pop-up must answer the script waiting for it.
  The X in the top-right corner does the same as Escape.
-->
<script module lang="ts">
  /** Each open window's openers, nearest first, for a window opened from inside it (see `openers` below). */
  const openersOf = new WeakMap<HTMLDialogElement, Element[]>();
</script>

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
    /** MPMB's own dialogs: as wide as the screen allows, up to 96 rem. */
    widest?: boolean;
    /** Phones: sits on top of the play view's tab bar instead of covering it (the More sheet). */
    aboveTabBar?: boolean;
    children: Snippet;
    actions?: Snippet;
  }

  let {
    title,
    onescape,
    closeLabel,
    wide = false,
    widest = false,
    aboveTabBar = false,
    children,
    actions,
  }: Props = $props();
  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = `modal-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  /**
   * Back to where the player was: the button that opened the window gets the focus again when it closes, also after
   * Escape (review of #92). A caller that moves the focus itself (the stat tiles do, after a tick) still wins: this
   * only acts when the focus fell to the page.
   *
   * A window opened from inside another one that then steps aside (the Sheet menu's Look, Rollback or Print) would
   * lose its opener with the first window, so it also remembers that window's openers, nearest first, and goes back
   * to the first one still on the page (the ☰ button). Read when the component is created, before the window
   * underneath is gone.
   */
  const active = typeof document === 'undefined' ? null : document.activeElement;
  const outer = active?.closest('dialog');
  const openers: Element[] = [...(active ? [active] : []), ...((outer && openersOf.get(outer)) ?? [])];
  $effect(() => {
    if (dialog) openersOf.set(dialog, openers);
  });
  $effect(() => () => {
    queueMicrotask(() => {
      const lost = !document.activeElement || document.activeElement === document.body;
      const back = openers.find((el) => el instanceof HTMLElement && el.isConnected);
      if (lost && back instanceof HTMLElement) back.focus();
    });
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

<dialog
  bind:this={dialog}
  class:wide
  class:widest
  class:above-bar={aboveTabBar}
  aria-labelledby={titleId}
  oncancel={cancel}
  onclose={closed}
>
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
    /* The small viewport (browser bars shown): a window opened while the bars were hidden still fits
       when they come back. */
    max-height: calc(100svh - 2rem);
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

  /*
   * MPMB's dialogs are laid out for Acrobat's wide windows; take what the screen offers. Source
   * Selection with its list of excluded elements needs about 1400 px to keep its lists readable.
   * Dialogs whose elements keep MPMB's narrower widths (Spell and Class Selection) get only as wide
   * as their content, so they don't show an empty band on the right.
   */
  dialog.widest {
    width: fit-content;
    min-width: min(56rem, calc(100vw - 2rem));
    max-width: min(96rem, calc(100vw - 2rem));
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

  /*
   * Phones (M13 step 2, mock-up pass 2): every window comes up from the bottom edge, full width, where the thumb
   * is, and the buttons share the bottom row. No drag handle: it would promise a swipe that isn't there.
   */
  @media (max-width: 699px) {
    /* The page behind stays where it is while a window is open (a phone scrolls it under the sheet otherwise). */
    :global(html:has(dialog[open])) {
      overflow: hidden;
    }

    dialog,
    dialog.wide,
    dialog.widest {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      max-height: calc(100svh - 2.5rem);
      margin: auto 0 0;
      border-width: 1px 0 0;
      border-radius: 1.125rem 1.125rem 0 0;
      box-shadow: 0 -0.5rem 2rem rgb(0 0 0 / 0.25);
    }

    h2 {
      padding: 0.875rem 0.25rem 0.5rem 1rem;
    }

    .body {
      padding: 0.25rem 1rem 1rem;
    }

    .actions {
      padding: 0.75rem 1rem max(1rem, env(safe-area-inset-bottom));
    }

    /*
     * Up to three buttons share the row equally (6 rem each fits three in 360 px); a fourth starts a new row.
     * `min-width: auto` (app.css gives buttons 44 px) keeps a button as wide as its longest word: German
     * "herunterladen" ran out of a third of 360 px, now the row wraps instead.
     */
    .actions > :global(*) {
      flex: 1 1 6rem;
      min-width: auto;
    }

    /* Without a button row the body reaches the bottom edge: keep it above the home bar. */
    .body:last-of-type {
      padding-bottom: max(1rem, env(safe-area-inset-bottom));
    }

    /*
     * The More sheet sits on the tab bar (mock-up pass 2), so the bar and its lit More stay in view under the
     * dimmed backdrop. The bar's height: CharacterView's .tabbar (its places plus the border and the home bar).
     */
    dialog.above-bar {
      --bar: calc(var(--tab-bar-height) + 1px + env(safe-area-inset-bottom));
      max-height: calc(100svh - 2.5rem - var(--bar));
      margin-bottom: var(--bar);
    }

    .above-bar .body:last-of-type {
      padding-bottom: 1rem;
    }
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
