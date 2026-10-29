<!--
  A modal window on the browser's <dialog>: it sits in the top layer, keeps focus inside, and Escape
  asks `onescape` instead of closing it, because every pop-up must answer the script waiting for it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    onescape: () => void;
    /** Wide windows for MPMB's dialogs, narrow ones for questions. */
    wide?: boolean;
    children: Snippet;
    actions?: Snippet;
  }

  let { title, onescape, wide = false, children, actions }: Props = $props();
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

<dialog bind:this={dialog} class:wide aria-labelledby={titleId} oncancel={cancel} onclose={closed}>
  <h2 id={titleId}>{title}</h2>
  <div class="body">
    {@render children()}
  </div>
  {#if actions}
    <div class="actions">
      {@render actions()}
    </div>
  {/if}
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
    /* The header and buttons stay put; the body scrolls when the content is long. */
    display: flex;
    flex-direction: column;
  }

  dialog:not([open]) {
    display: none;
  }

  dialog.wide {
    width: min(56rem, calc(100vw - 2rem));
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  h2 {
    margin: 0;
    padding: 1rem 1.25rem 0.5rem;
    font-size: 1.125rem;
    line-height: 1.3;
  }

  .body {
    padding: 0.25rem 1.25rem 1rem;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem 1rem;
    border-top: 1px solid var(--line);
  }
</style>
