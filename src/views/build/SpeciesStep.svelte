<!--
  Build step 2: the species (M6, as drawn). MPMB's species from the chosen sources and add-on scripts,
  with their variants (a dragonborn's ancestry, an elf's lineage). Taking one writes its name into MPMB's
  "Race" field, which MPMB reads as if the player had typed it, and fills in the traits.
-->
<script lang="ts">
  import type { BuilderInfo } from '../../engine/builder.ts';
  import type { SpeciesFacts, SpeciesInfo } from '../../engine/origins.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import RichText from '../play/RichText.svelte';
  import CatalogStep from './CatalogStep.svelte';
  import { factsLine } from './origins.ts';

  interface Props {
    info: BuilderInfo;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { info, disabled, change, t }: Props = $props();

  const origins = $derived(info.origins);
  const current = $derived(origins.race);
  /** The species shown in the details; the character's own at first. */
  let chosen = $state('');
  let variant = $state('');
  const shownKey = $derived(chosen || current.key || origins.species[0]?.key || '');
  const species = $derived<SpeciesInfo | undefined>(origins.species.filter((s) => s.key === shownKey)[0]);
  const shownVariant = $derived(
    species?.variants.filter((v) => v.key === (variant || (shownKey === current.key ? current.variant : '')))[0],
  );
  const onSheet = $derived(shownKey === current.key && (shownVariant?.key ?? '') === current.variant);

  const items = $derived(
    origins.species.map((s) => {
      const own = s.key === current.key ? s.variants.filter((v) => v.key === current.variant)[0] : undefined;
      return {
        value: s.key,
        label: own ? `${s.name} · ${own.label}` : s.name,
        line: factsLine(own ?? s, t),
        source: own?.source ?? s.source,
        current: s.key === current.key,
      };
    }),
  );

  function select(key: string) {
    chosen = key;
    variant = '';
  }

  function take() {
    const name = shownVariant?.name ?? species?.name;
    if (name) change([{ edit: 'Race', text: name }]);
  }

  const facts = $derived<SpeciesFacts | undefined>(shownVariant ?? species);
  const traits = $derived((shownVariant?.traits ?? species?.traits ?? '').replaceAll('DAMAGE_TYPE', t.buildByVariant));
</script>

<CatalogStep
  title={t.buildSpecies}
  line={fill(t.buildCatalogLine, { count: origins.species.length })}
  searchLabel={t.buildSearchSpecies}
  {items}
  selected={shownKey}
  onselect={select}
  {t}
>
  {#snippet detail()}
    {#if species}
      <h3>{species.name}</h3>
      <p class="meta">{shownVariant?.source ?? species.source}{facts ? ` · ${factsLine(facts, t)}` : ''}</p>
      {#if species.variants.length}
        <p class="lbl" id="variant-label">{t.buildVariant}</p>
        <div class="chips" role="group" aria-labelledby="variant-label">
          {#each species.variants as v (v.key)}
            <button type="button" aria-pressed={v.key === shownVariant?.key} onclick={() => (variant = v.key)}
              >{v.label}</button
            >
          {/each}
        </div>
      {/if}
      <div class="traits" lang="en"><RichText text={traits} /></div>
      {#if !t.locale.startsWith('en')}<p class="note">{t.buildEnglishNote}</p>{/if}
      {#if onSheet}
        <p class="on-sheet">{t.buildOnSheet}</p>
      {:else}
        <button
          type="button"
          class="primary take"
          disabled={disabled || (species.variants.length > 0 && !shownVariant)}
          onclick={take}
        >
          {species.variants.length && !shownVariant
            ? t.buildPickVariantFirst
            : fill(t.buildTake, { name: shownVariant?.name ?? species.name })}
        </button>
      {/if}
    {/if}
  {/snippet}
</CatalogStep>
