<!-- Senses and defenses, then MPMB's feature texts: class, species, feats, background. -->
<script lang="ts">
  import { choicesHref } from '../../build/choose-link.ts';
  import type { Texts } from '../../i18n.ts';
  import { readDefenses, readFeatures, textRuns } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import RichText from './RichText.svelte';

  let { fields, characterId, t }: { fields: FieldViews; characterId: string; t: Texts } = $props();
  const choose = $derived({ href: (feature: string) => choicesHref(characterId, feature), label: t.featuresChoose });
  const features = $derived(readFeatures(fields));
  const defenses = $derived(readDefenses(fields));
  /** Senses, resistances, MPMB's labelled lines (immunities …), then the rest: one card each. */
  const cards = $derived(
    [
      { title: t.senses, items: defenses.senses, resistance: false, sentences: false },
      { title: t.resistances, items: defenses.resistances, resistance: true, sentences: false },
      ...defenses.labelled.map((card) => ({
        title: card.title === 'Immunities' ? t.immunities : t.advantageAgainst,
        items: card.items,
        resistance: false,
        sentences: false,
      })),
      // MPMB's other entries are sentences with its marks ("**Dex Save for Half**. *Failure:* …").
      { title: t.savesOther, items: defenses.other, resistance: false, sentences: true },
    ].filter((card) => card.items.length),
  );
</script>

{#if cards.length}
  <div class="cards" role="group" aria-label={t.sensesDefenses}>
    {#each cards as card, i (i)}
      <section class="panel card" aria-labelledby="defense-{i}">
        <h2 id="defense-{i}">{card.title}</h2>
        <ul>
          {#each card.items as item, j (j)}
            {#if card.sentences}
              <li class="sentence">
                {#each textRuns(item) as run, k (k)}
                  {#if run.bold}<b>{run.text}</b>{:else if run.italic}<i>{run.text}</i>{:else}{run.text}{/if}
                {/each}
              </li>
            {:else}
              <li class:resistance={card.resistance}>{item}</li>
            {/if}
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

{#each features as block, i (i)}
  <section class="panel">
    {#if block.title}<h2>{block.title}</h2>{/if}
    <RichText text={block.text} {choose} />
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

  /* Senses, resistances and immunities side by side, as many per row as fit. */
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0 0.625rem;
  }

  .card h2 {
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .card ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card li {
    padding: 0.125rem 0.625rem;
    border-radius: 1rem;
    background: var(--accent-soft);
    font-weight: 700;
  }

  .card li.resistance {
    background: var(--hp-soft);
  }

  .card li.sentence {
    padding: 0;
    border-radius: 0;
    background: none;
    font-weight: 400;
  }
</style>
