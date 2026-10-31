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
  }

  let { open, back, t, children }: Props = $props();

  const statusText = $derived(
    { opening: t.opening, working: t.saving, saving: t.saving, saved: t.saved, error: '' }[open.status],
  );
</script>

<header class="top">
  <a class="back" href={back.href}>← {back.label}</a>
  <div class="who">
    <h1>{open.meta.name || t.unnamed}</h1>
    <p>{[open.meta.classes, open.meta.species].filter(Boolean).join(' · ')}</p>
  </div>
  {#if statusText}<span class="status" class:busy={open.status !== 'saved'} aria-live="polite">{statusText}</span>{/if}
  <div class="actions">
    {@render children()}
  </div>
</header>

<style>
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    padding: 0.375rem max(1rem, env(safe-area-inset-right)) 0.375rem max(1rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
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
    color: var(--ink-muted);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    color: var(--ink-muted);
    font-size: 0.875rem;
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

  /* Phones come later (roadmap); until then the buttons wrap. */
  @media (max-width: 699px) {
    .actions {
      flex-wrap: wrap;
    }
  }
</style>
