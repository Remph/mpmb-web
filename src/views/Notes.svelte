<!-- What the last import, restore or action did: progress, results and errors. -->
<script lang="ts">
  import type { Note } from '../session.svelte.ts';

  let { notes }: { notes: Note[] } = $props();
</script>

{#if notes.length}
  <ul class="notes" aria-live="polite">
    {#each notes as note (note.id)}
      <li class={note.kind}>
        <span class="icon" aria-hidden="true">{note.kind === 'ok' ? '✓' : note.kind === 'error' ? '!' : '…'}</span>
        <span>{note.text}</span>
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
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--line);
    overflow-wrap: anywhere;
  }

  .error {
    border-color: var(--danger);
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
