<!--
  Build step 3: the background (M6), laid out like the species. Taking one writes its name into MPMB's
  "Background" field; MPMB fills in the skills, tools and equipment. Its ability score increase is set
  in the ability scores step, where the +2 and +1 go.
-->
<script lang="ts">
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import CatalogStep from './CatalogStep.svelte';

  interface Props {
    info: BuilderInfo;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { info, disabled, change, t }: Props = $props();

  const origins = $derived(info.origins);
  const current = $derived(origins.background);
  let chosen = $state('');
  let variant = $state('');
  const shownKey = $derived(chosen || current.key || origins.backgrounds[0]?.key || '');
  const background = $derived(origins.backgrounds.filter((b) => b.key === shownKey)[0]);
  const shownVariant = $derived(
    background?.variants.filter((v) => v.key === (variant || (shownKey === current.key ? current.variant : '')))[0],
  );
  const onSheet = $derived(shownKey === current.key && (shownVariant?.key ?? '') === current.variant);

  const items = $derived(
    origins.backgrounds.map((b) => {
      const own = b.key === current.key ? b.variants.filter((v) => v.key === current.variant)[0] : undefined;
      return {
        value: b.key,
        label: own?.name ?? b.name,
        line: b.skills.join(', '),
        source: own?.source ?? b.source,
        current: b.key === current.key,
      };
    }),
  );

  function select(key: string) {
    chosen = key;
    variant = '';
  }

  function take() {
    const name = shownVariant?.name ?? background?.name;
    if (name) change([{ edit: 'Background', text: name }]);
  }
</script>

<CatalogStep
  title={t.buildBackground}
  line={fill(t.buildCatalogLine, { count: origins.backgrounds.length })}
  searchLabel={t.buildSearchBackgrounds}
  {items}
  selected={shownKey}
  onselect={select}
  {t}
>
  {#snippet detail()}
    {#if background}
      <h3>{background.name}</h3>
      <p class="meta">{shownVariant?.source ?? background.source}</p>
      {#if background.variants.length}
        <p class="lbl" id="bg-variant-label">{t.buildVariant}</p>
        <div class="chips" role="group" aria-labelledby="bg-variant-label">
          <button type="button" aria-pressed={!shownVariant} onclick={() => (variant = '')}>{background.name}</button>
          {#each background.variants as v (v.key)}
            <button type="button" aria-pressed={v.key === shownVariant?.key} onclick={() => (variant = v.key)}
              >{v.name}</button
            >
          {/each}
        </div>
      {/if}
      <dl lang="en">
        {#if background.skills.length}<dt lang={t.locale}>{t.buildSkills}</dt>
          <dd>{background.skills.join(', ')}</dd>{/if}
        {#if background.tools.length}<dt lang={t.locale}>{t.buildTools}</dt>
          <dd>{background.tools.join(', ')}</dd>{/if}
        {#if background.scoresText}<dt lang={t.locale}>{t.buildAbilities}</dt>
          <dd>{background.scoresText}</dd>{/if}
      </dl>
      {#if !t.locale.startsWith('en')}<p class="note">{t.buildEnglishNote}</p>{/if}
      {#if onSheet}
        <p class="on-sheet">{t.buildOnSheet}</p>
      {:else}
        <button type="button" class="primary take" {disabled} onclick={take}>
          {fill(t.buildTake, { name: shownVariant?.name ?? background.name })}
        </button>
      {/if}
    {/if}
  {/snippet}
</CatalogStep>
