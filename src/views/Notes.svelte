<!--
  What the last import, restore or action did: progress, results and errors. A note may end in a button
  that is the way out of what it says ("Reopen character", "Take over"; Nick's pick A, 2026-11-04).
-->
<script lang="ts">
  import type { Note } from '../session.svelte.ts';

  let { notes }: { notes: Note[] } = $props();
  const ICONS: Record<Note['kind'], string> = { ok: '✓', error: '!', busy: '…', info: 'i' };
</script>

{#if notes.length}
  <ul class="notes" aria-live="polite">
    {#each notes as note (note.id)}
      <li class={note.kind}>
        <span class="icon" aria-hidden="true">{ICONS[note.kind]}</span>
        <span class="text">{note.text}</span>
        {#if note.action}
          <button type="button" class="primary" onclick={note.action.run}>{note.action.label}</button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .notes {
    list-style: none;
    margin: 0 0 1.25rem;
    padding: 0;
    display: grid;
    gap: 0.375rem;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--line);
    overflow-wrap: anywhere;
  }

  .text {
    flex: 1;
    /* Wide enough to read before the button wraps below it on a phone. */
    min-width: min(14rem, 100%);
  }

  .error {
    border-color: var(--danger);
  }

  .info {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .info .icon {
    color: var(--accent);
  }

  .icon {
    font-weight: 700;
    width: 1rem;
    flex: none;
  }

  .ok .icon {
    color: var(--ok);
  }

  .error .icon {
    color: var(--danger);
  }
</style>
