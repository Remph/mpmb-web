<!--
  The bar on top of a character's screens (play view, Build screen): the way back, the character's name,
  whether the last change is saved, and the screen's own buttons.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Texts } from '../i18n.ts';
  import type { OpenCharacter } from '../session.svelte.ts';

  interface Props {
    open: OpenCharacter;
    back: { href: string; label: string };
    t: Texts;
    children: Snippet;
    /** When given, a last button folds the bar away (the play view; session feedback, 2026-11-04). */
    onfold?: () => void;
    /** Phones (M13): one row, the way back as an arrow, the name cut short rather than wrapped. */
    compact?: boolean;
    /** Right after the name (phones: the companions' "+1 ▾" switcher). */
    afterName?: Snippet;
    /** With sync on (M15): whether the last change reached the service; "Synced" instead of "Saved" then. */
    sync?: 'synced' | 'waiting' | 'offline' | null;
  }

  let { open, back, t, children, onfold, compact = false, afterName, sync = null }: Props = $props();

  const savedText = $derived(sync === 'synced' ? `✓ ${t.synced}` : sync === 'offline' ? t.savedHere : t.saved);
  const statusText = $derived(
    {
      opening: t.opening,
      working: t.saving,
      saving: t.saving,
      saved: savedText,
      error: '',
      elsewhere: '',
      readonly: t.syncReadOnlyBar,
    }[open.status],
  );
</script>

<header class="top" class:compact>
  {#if compact}
    <a class="back" href={back.href} aria-label={back.label}><span aria-hidden="true">‹</span></a>
  {:else}
    <a class="back" href={back.href}>← {back.label}</a>
  {/if}
  <div class="who">
    {#if afterName}
      <div class="name-line">
        <h1>{open.meta.name || t.unnamed}</h1>
        {@render afterName()}
      </div>
    {:else}
      <h1>{open.meta.name || t.unnamed}</h1>
    {/if}
    <p>{[open.meta.classes, open.meta.species].filter(Boolean).join(' · ')}</p>
  </div>
  {#if statusText}
    <span
      class="status"
      class:busy={open.status !== 'saved' && open.status !== 'readonly'}
      class:synced={open.status === 'saved' && sync === 'synced'}
      aria-live="polite">{statusText}</span
    >
  {/if}
  <div class="actions">
    {@render children()}
    {#if onfold}
      <button type="button" class="fold" aria-label={t.foldBar} title={t.foldBar} onclick={onfold}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
      </button>
    {/if}
  </div>
</header>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    /* The bar spans the screen; its contents line up with the page below, which stops at --page-max. */
    padding: 0.375rem max(1rem, env(safe-area-inset-right), calc((100% - var(--page-max)) / 2 + 1rem)) 0.375rem
      max(1rem, env(safe-area-inset-left), calc((100% - var(--page-max)) / 2 + 1rem));
    /* With sheet colours, a stripe in the character's colour (app.css, [data-sheet]). */
    border-bottom: var(--bar-edge, 1px solid var(--line));
    /* A theme may paint the bar (Campfire's sky, with its own letter colours); Purple keeps the card colour. */
    background: var(--bar, var(--surface));
    color: var(--on-bar, var(--ink));
  }

  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--on-bar-link, var(--accent));
    font-weight: 500;
    text-decoration: none;
  }

  .who {
    flex: 1;
    min-width: 12rem;
    line-height: 1.2;
  }

  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .who p {
    margin: 0;
    overflow: hidden;
    color: var(--on-bar-muted, var(--ink-muted));
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    color: var(--on-bar-muted, var(--ink-muted));
    font-size: 0.875rem;
  }

  .status.synced {
    /* A painted bar (Campfire) keeps its own letter colour: green on its sky would be hard to read. */
    color: var(--on-bar, var(--ok));
    font-weight: 700;
  }

  .status.busy::before {
    content: '';
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    margin-right: 0.375rem;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: -0.1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status.busy::before {
      animation: none;
    }
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Round and quiet: it moves the bar, it isn't one of the screen's actions. */
  .fold {
    display: inline-grid;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    color: var(--accent);
  }

  .fold svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Phones (M13): one row of 56 px; the name and the classes cut short with an ellipsis instead of wrapping. */
  .compact {
    flex-wrap: nowrap;
    gap: 0.25rem;
    padding: 0.25rem max(0.25rem, env(safe-area-inset-right)) 0.25rem max(0.25rem, env(safe-area-inset-left));
  }

  .compact .back {
    justify-content: center;
    width: 44px;
    flex: none;
    font-size: 1.75rem;
    line-height: 1;
  }

  .compact .who {
    min-width: 0;
  }

  /* The name gives way to what follows it: the name is cut short, the switcher stays whole. */
  .name-line {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }

  .name-line h1 {
    min-width: 0;
  }

  .compact h1 {
    overflow: hidden;
    font-size: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compact .who p {
    font-size: 0.8125rem;
  }

  .compact .status {
    flex: none;
    /* Two short lines rather than one long one: offline, "Auf diesem Gerät gespeichert" left the name three
       letters on a 320 px phone. */
    max-width: 6.75rem;
    font-size: 0.8125rem;
    line-height: 1.2;
    text-align: end;
  }

  .compact .actions {
    flex: none;
  }
</style>
