<!--
  Build steps 2 to 7 until their own design comes (the next M6 updates): what the sheet has now, and
  MPMB's own way to change it (typing a name into its field, its dialogs and menus).
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES, shown, valueOf } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import type { BuildStep } from './steps.ts';

  interface Props {
    step: Exclude<BuildStep, 'class'>;
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { step, fields, disabled, change, t }: Props = $props();

  const FEAT_FIELDS = Array.from({ length: 9 }, (_, i) => `Feat Name ${i + 1}`);
  /** The feats the sheet has, plus one empty line for the next. */
  const featFields = $derived.by(() => {
    const filled = FEAT_FIELDS.filter((name) => valueOf(fields, name));
    const empty = FEAT_FIELDS.filter((name) => !valueOf(fields, name))[0];
    return empty ? [...filled, empty] : filled;
  });
  const ABILITY_NAMES = $derived([t.shortStr, t.shortDex, t.shortCon, t.shortInt, t.shortWis, t.shortCha]);

  const title = $derived(
    {
      species: t.buildSpecies,
      background: t.buildBackground,
      abilities: t.buildAbilities,
      feats: t.buildFeats,
      choices: t.buildChoices,
      modifiers: t.buildModifiers,
    }[step],
  );
</script>

{#snippet typed(field: string, label: string)}
  <label class="field">
    <span class="lbl">{label}</span>
    <input
      type="text"
      value={valueOf(fields, field)}
      {disabled}
      onchange={(e) => change([{ edit: field, text: e.currentTarget.value }])}
    />
  </label>
{/snippet}

<section class="card">
  <h2>{title}</h2>
  <p class="soon">{t.buildComingNext}</p>

  {#if step === 'species'}
    {@render typed('Race', t.buildSpecies)}
    <p class="hint">{t.buildTypeName}</p>
  {:else if step === 'background'}
    {@render typed('Background', t.buildBackground)}
    <p class="hint">{t.buildTypeName}</p>
  {:else if step === 'abilities'}
    <div class="six">
      {#each ABILITIES as ability, i (ability)}
        <div><small>{ABILITY_NAMES[i]}</small><b>{shown(fields, ability) || '–'}</b></div>
      {/each}
    </div>
    <button type="button" {disabled} onclick={() => change([{ click: 'Ability Scores Button' }])}>
      {t.buildOpenScores}
    </button>
  {:else if step === 'feats'}
    {#each featFields as field, i (field)}
      {@render typed(field, `${t.buildFeat} ${i + 1}`)}
    {/each}
    <p class="hint">{t.buildTypeName}</p>
  {:else if step === 'choices'}
    <div class="buttons">
      <button type="button" {disabled} onclick={() => change([{ click: 'Class Features Menu' }])}>
        {t.buildClassChoices}
      </button>
      <button type="button" {disabled} onclick={() => change([{ click: 'Race Features Menu' }])}>
        {t.buildSpeciesChoices}
      </button>
    </div>
  {:else}
    <p class="hint">{t.buildModifiersLater}</p>
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  p {
    margin: 0;
  }

  .soon {
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
  }

  .hint {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .lbl {
    display: block;
    margin-bottom: 0.125rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .six {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .six div {
    padding: 0.375rem 0.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    text-align: center;
  }

  .six small {
    display: block;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .six b {
    font-size: 1.5rem;
    font-weight: 800;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  @media (max-width: 1099px) {
    .six {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
