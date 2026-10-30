<!--
  MPMB's feature text with its marks (**bold**, #bold#, *italic*), one paragraph per line. Like the 2024
  sheet, a feature's name stands out in the accent colour, its source is quieter and its uses sit in an
  outlined pill; a line that is all bold (a class, a species) is a heading.
-->
<script lang="ts">
  import { featureLine, linesOf } from '../../play/read.ts';

  let { text }: { text: string } = $props();
  const lines = $derived(
    linesOf(text)
      .filter((line) => line.trim() !== '')
      .map(featureLine),
  );
</script>

{#each lines as line, i (i)}
  {#if 'heading' in line}
    <h3>{line.heading}</h3>
  {:else}
    <p>
      {#each line.runs as run, j (j)}
        {#if run.role === 'name'}<b class="name">{run.text}</b>{:else if run.role === 'usage'}<span class="usage"
            >{run.text}</span
          >{:else if run.role === 'source'}<span class="source">{run.text}</span>{:else if run.bold}<b>{run.text}</b
          >{:else if run.italic}<i>{run.text}</i>{:else}{run.text}{/if}
      {/each}
    </p>
  {/if}
{/each}

<style>
  p {
    margin: 0 0 0.375rem;
    max-width: 70ch;
  }

  h3 {
    margin: 0.75rem 0 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 2px solid var(--accent);
    font-size: 1.0625rem;
    font-weight: 800;
  }

  h3:first-child {
    margin-top: 0;
  }

  .name {
    color: var(--accent);
    font-weight: 800;
  }

  .source {
    margin-left: 0.25rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .usage {
    display: inline-block;
    margin-left: 0.25rem;
    padding: 0 0.5rem;
    border: 1px solid var(--accent);
    border-radius: 1rem;
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 700;
  }
</style>
