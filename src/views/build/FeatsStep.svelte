<!--
  Build step 5: the feats (M6). The character's feats from MPMB's nine "Feat Name" lines, each with what
  it does, and one way to add another: MPMB's feats from the chosen sources, then the feat's form when it
  has several (Magic Initiate: Cleric, Druid or Wizard). The name goes into the first free line as MPMB
  would read it typed ("Magic Initiate [Cleric]"); MPMB checks the prerequisites itself and asks.
-->
<script lang="ts">
  import type { BuilderInfo } from '../../engine/builder.ts';
  import type { FeatInfo } from '../../engine/origins.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { valueOf } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import PickList from './PickList.svelte';

  interface Props {
    info: BuilderInfo;
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { info, fields, disabled, change, t }: Props = $props();

  const LINES = Array.from({ length: 9 }, (_, i) => i + 1);
  /** MPMB's feat types in the order a character meets them; others (older add-ons) after these. */
  const TYPE_ORDER = ['origin', 'general', 'fighting style', 'epic boon'];
  const typeName = (type: string): string =>
    ({
      origin: t.buildFeatOrigin,
      general: t.buildFeatGeneral,
      'fighting style': t.buildFeatFightingStyle,
      'epic boon': t.buildFeatEpicBoon,
    })[type] ?? type;

  const catalog = $derived(info.origins.feats);
  const featOf = (key: string): FeatInfo | undefined => catalog.filter((f) => f.key === key)[0];
  const lines = $derived(
    LINES.map((n) => ({
      n,
      name: valueOf(fields, `Feat Name ${n}`),
      text: valueOf(fields, `Feat Description ${n}`),
      feat: featOf(info.origins.featLines[n - 1]?.key ?? ''),
    })).filter((line) => line.name),
  );
  const freeLine = $derived(LINES.filter((n) => !valueOf(fields, `Feat Name ${n}`))[0]);

  let picking = $state<'feat' | FeatInfo | null>(null);

  const rank = (type: string): number => {
    const i = TYPE_ORDER.indexOf(type);
    return i === -1 ? TYPE_ORDER.length : i;
  };
  const featOptions = $derived(
    catalog
      .filter((f) => !f.taken)
      .sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name))
      .map((f) => ({
        value: f.key,
        label: f.name,
        line: [
          typeName(f.type),
          f.prerequisite &&
            `${fill(t.buildNeeds, { what: f.prerequisite })}${f.meets === false ? ` ${t.buildNotMet}` : ''}`,
        ]
          .filter(Boolean)
          .join(' · '),
        source: f.source,
      })),
  );

  function write(text: string) {
    picking = null;
    if (freeLine) change([{ edit: `Feat Name ${freeLine}`, text }]);
  }

  function pickedFeat(key: string) {
    const feat = featOf(key);
    if (!feat) return;
    if (feat.choices.length) picking = feat;
    else write(feat.name);
  }

  function pickedChoice(key: string) {
    const feat = picking && picking !== 'feat' ? picking : null;
    const choice = feat?.choices.filter((c) => c.key === key)[0];
    if (choice) write(choice.text);
  }
</script>

<section class="card">
  <h2>{t.buildFeats}</h2>
  <p class="line">{t.buildFeatsLine}</p>

  {#each lines as line (line.n)}
    <div class="feat">
      <div class="text">
        <b>{line.name}</b>
        {#if line.feat}
          <small
            >{[typeName(line.feat.type), line.feat.prerequisite && fill(t.buildNeeds, { what: line.feat.prerequisite })]
              .filter(Boolean)
              .join(' · ')} · {line.feat.source}</small
          >
        {:else}
          <small class="warn">{t.buildUnknownFeat}</small>
        {/if}
        {#if line.text}<p lang="en">{line.text}</p>{/if}
      </div>
      <button
        type="button"
        class="quiet remove"
        aria-label={fill(t.buildRemoveFeat, { name: line.name })}
        title={fill(t.buildRemoveFeat, { name: line.name })}
        {disabled}
        onclick={() => change([{ edit: `Feat Name ${line.n}`, text: '' }])}>✕</button
      >
    </div>
  {:else}
    <p class="none">{t.buildNoFeats}</p>
  {/each}

  {#if freeLine}
    <button type="button" class="add" class:primary={!lines.length} {disabled} onclick={() => (picking = 'feat')}>
      {t.buildAddFeat}
    </button>
  {:else}
    <p class="none">{t.buildFeatsFull}</p>
  {/if}
  {#if !t.locale.startsWith('en') && lines.length}<p class="note">{t.buildEnglishNote}</p>{/if}
</section>

{#if picking === 'feat'}
  <PickList
    title={t.buildAddFeat.replace(/^\+\s*/, '')}
    options={featOptions}
    current=""
    onpick={pickedFeat}
    onclose={() => (picking = null)}
    {t}
  />
{:else if picking}
  <PickList
    title={fill(t.buildFeatForm, { name: picking.name })}
    options={picking.choices.map((c) => ({ value: c.key, label: c.name }))}
    current=""
    onpick={pickedChoice}
    onclose={() => (picking = null)}
    {t}
  />
{/if}

<style>
  .card {
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

  .line {
    margin: 0.125rem 0 1rem;
    color: var(--ink-muted);
  }

  .feat {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem 0;
    border-top: 1px solid var(--line);
  }

  .feat:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .text {
    display: grid;
    min-width: 0;
    line-height: 1.35;
  }

  .text small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .text small.warn {
    color: var(--danger);
  }

  .text p {
    margin: 0.375rem 0 0;
    max-width: 70ch;
  }

  .remove {
    padding: 0;
  }

  .none,
  .note {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
  }

  .note {
    font-size: 0.875rem;
  }

  .add {
    width: 100%;
    margin-top: 0.75rem;
  }

  .add:not(.primary) {
    border-style: dashed;
    color: var(--accent);
  }
</style>
