<!-- Senses and defenses, then MPMB's feature texts: class, species, feats, background. -->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import { linesOf, readFeatures, valueOf } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import RichText from './RichText.svelte';

  let { fields, t }: { fields: FieldViews; t: Texts } = $props();
  const features = $derived(readFeatures(fields));
  const RESISTANCE_ROWS = [1, 2, 3, 4, 5, 6];
  /** "**Resistances**. Cold, Fire", in MPMB's own marks like the line about immunities below it. */
  const resistances = (types: string[]): string => (types.length ? `**${t.resistances}**. ${types.join(', ')}` : '');
  const defenses = $derived(
    [
      valueOf(fields, 'Vision'),
      resistances(RESISTANCE_ROWS.map((n) => valueOf(fields, `Resistance Damage Type ${n}`)).filter(Boolean)),
      ...linesOf(valueOf(fields, 'Saving Throw advantages / disadvantages')),
    ].filter((line) => line.trim() !== ''),
  );
</script>

{#if defenses.length}
  <section class="panel" aria-labelledby="defenses-title">
    <h2 id="defenses-title">{t.sensesDefenses}</h2>
    {#each defenses as line, i (i)}<RichText text={line} />{/each}
  </section>
{/if}

{#each features as block, i (i)}
  <section class="panel">
    {#if block.title}<h2>{block.title}</h2>{/if}
    <RichText text={block.text} />
  </section>
{/each}

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    font-size: 0.9375rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }
</style>
