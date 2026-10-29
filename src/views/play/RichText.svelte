<!-- MPMB's feature text with its marks (**bold**, #bold#, *italic*), one paragraph per line. -->
<script lang="ts">
  import { linesOf, textRuns } from '../../play/read.ts';

  let { text }: { text: string } = $props();
  const lines = $derived(linesOf(text).filter((line) => line.trim() !== ''));
</script>

{#each lines as line, i (i)}
  <p>
    {#each textRuns(line) as run, j (j)}
      {#if run.bold}<b>{run.text}</b>{:else if run.italic}<i>{run.text}</i>{:else}{run.text}{/if}
    {/each}
  </p>
{/each}

<style>
  p {
    margin: 0 0 0.375rem;
    max-width: 70ch;
  }
</style>
