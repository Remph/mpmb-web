<!--
  Senses and defenses, the proficiencies (M6.5: armour, weapons, tools, languages), then MPMB's feature
  texts: class, species, feats, background.
-->
<script lang="ts">
  import { choicesHref } from '../../build/choose-link.ts';
  import { hasProficiencies, moreProficiencies, readProficiencies } from '../../build/proficiencies.ts';
  import type { Texts } from '../../i18n.ts';
  import { readDefenses, readFeatures, textRuns } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import RichText from './RichText.svelte';

  let { fields, characterId, t }: { fields: FieldViews; characterId: string; t: Texts } = $props();
  const choose = $derived({ href: (feature: string) => choicesHref(characterId, feature), label: t.featuresChoose });
  const features = $derived(readFeatures(fields));
  const defenses = $derived(readDefenses(fields));
  const profs = $derived(readProficiencies(fields));
  /** The proficiency card's rows, the empty ones left out. MPMB's own texts (other weapons) as written. */
  const profRows = $derived(
    [
      {
        label: t.profArmour,
        items: [...profs.armour.map((k) => t[`prof_${k}`]), ...(profs.otherArmour ? [profs.otherArmour] : [])],
      },
      {
        label: t.profWeapons,
        items: [...profs.weapons.map((k) => t[`prof_${k}`]), ...(profs.otherWeapons ? [profs.otherWeapons] : [])],
      },
      { label: t.profTools, items: profs.tools },
      { label: t.profLanguages, items: profs.languages },
      // Languages and tools past the sheet's rows (MPMB's overflow page), one chip each.
      { label: t.profMore, items: moreProficiencies(profs) },
    ].filter((row) => row.items.length),
  );
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

{#if hasProficiencies(profs)}
  <section class="panel profs" aria-labelledby="profs-title">
    <h2 id="profs-title">{t.proficiencies}</h2>
    {#each profRows as row (row.label)}
      <div class="prof">
        <span class="label">{row.label}</span>
        <ul>
          {#each row.items as item, j (j)}<li>{item}</li>{/each}
        </ul>
      </div>
    {/each}
  </section>
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

  .profs h2 {
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-bottom: 0.25rem;
  }

  /* One row per kind: its name on the left, the chips beside it. */
  .prof {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  .prof:first-of-type {
    border-top: 0;
  }

  .prof .label {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .prof ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .prof li {
    padding: 0.125rem 0.625rem;
    border-radius: 1rem;
    background: var(--accent-soft);
    font-weight: 700;
  }

  .card li.sentence {
    padding: 0;
    border-radius: 0;
    background: none;
    font-weight: 400;
  }
</style>
