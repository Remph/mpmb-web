<!--
  The Spells tab (M4.6, layout "by level" that Nick picked on 2026-10-31): the spells on MPMB's spell sheet
  pages, one block per spell level with that level's slots in its heading, so finding a spell and ticking
  the slot happen in one place. The mark in front of a spell ticks it prepared, as a click on the PDF's
  box does; choosing which spells are on the sheet stays in MPMB's Spells menu.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { ABILITIES, isOn, readSpellSlotUse } from '../../play/read.ts';
  import { checkboxField, isReady, preparedCount, readSpells, spellText } from '../../play/spells.ts';
  import type { Spell, SpellSource } from '../../play/spells.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Dots from './Dots.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const sources = $derived(readSpells(fields));
  const slots = $derived(readSpellSlotUse(fields));
  let showAll = $state(false);

  /** The source with the most levelled spells is "the" class; spells from others name where they come from. */
  const main = $derived(
    sources.reduce<SpellSource | undefined>((best, s) => (!best || levelled(s) > levelled(best) ? s : best), undefined),
  );
  function levelled(source: SpellSource): number {
    return source.levels.filter((l) => l.level > 0).reduce((n, l) => n + l.spells.length, 0);
  }

  interface Entry {
    spell: Spell;
    source: SpellSource;
    level: number;
  }

  /** One block per spell level, the sources in the sheet's order inside it. */
  const levels = $derived(
    [...new Set(sources.flatMap((s) => s.levels.map((l) => l.level)))]
      .sort((a, b) => a - b)
      .map((level) => ({
        level,
        entries: sources.flatMap((source) =>
          source.levels
            .filter((l) => l.level === level)
            .flatMap((l) => l.spells)
            .filter((spell) => showAll || isReady(spell))
            .map((spell): Entry => ({ spell, source, level })),
        ),
        slots: slots.find((s) => s.level === level),
      }))
      .filter((block) => block.entries.length > 0),
  );

  /** One save DC and attack for all sources, the usual case; otherwise each source shows its own. */
  const sameNumbers = $derived(new Set(sources.map((s) => `${s.dc}|${s.attack}`)).size <= 1);

  /** "Paladin Spells" names the class; the tags beside a spell say "Paladin". */
  // A trailing " Spells": "Evoker Spells" matches, "Magic Initiate" doesn't. Try it:
  // https://regex101.com/?regex=%5Cs%2BSpells%24&testString=Evoker%20Spells
  const shortTitle = (source: SpellSource): string => source.title.replace(/\s+Spells$/, '');

  const levelName = (level: number): string => (level === 0 ? t.cantrips : fill(t.slotLevel, { count: level }));

  /** An option's name without its spell's initials: "AH: Clenched Fist" is "Clenched Fist". */
  // Try it: https://regex101.com/?regex=%5E%5B%5E%3A%5D%2B%3A%5Cs*&testString=AH%3A%20Clenched%20Fist ("Web" stays).
  const optionName = (option: Spell): string => option.name.replace(/^[^:]+:\s*/, '');

  const TIMES: Record<string, keyof Texts> = { Act: 'action', Bns: 'bonusAction', React: 'reaction' };
  const time = (spell: Spell): string => {
    const key = TIMES[spell.time];
    return key ? String(t[key]) : spell.time;
  };
  /** MPMB writes "S:9-m rad" for an area around the caster. */
  const range = (spell: Spell): string => spell.range.replace(/^S:\s*/, `${t.spellSelf}, `);
  const save = (spell: Spell): string => {
    if (!spell.save) return '';
    const ability = ABILITIES.find((a) => a === spell.save);
    return fill(t.spellSave, { ability: ability ? t[`short${ability}`] : spell.save });
  };
  const meta = (spell: Spell): string =>
    [time(spell), range(spell), save(spell), spell.duration].filter(Boolean).join(' · ');

  const markLabel = (spell: Spell): string => {
    const name = spell.fullName;
    if (spell.mark.free !== null) return fill(spell.mark.freeUsed ? t.spellFreeUsedTap : t.spellFreeTap, { name });
    return fill(spell.mark.prepared ? t.spellPrepare : t.spellUnprepare, { name });
  };
  /** MPMB's own click on the box toggles it, as in Acrobat (checkbox ↔ checkedbox, once ↔ once_used). */
  const tap = (spell: Spell): void => change([{ click: checkboxField(spell) }]);

  let details: Entry | null = $state(null);
  /** The spell as it is now, so a tap in the pop-up shows its new state. */
  const shown = $derived.by((): Spell | undefined => {
    const open = details;
    if (!open) return undefined;
    return sources
      .flatMap((s) => s.levels.flatMap((l) => l.spells))
      .find((s) => s.page === open.spell.page && s.row === open.spell.row);
  });
  const text = $derived(shown ? spellText(shown.text) : null);
  const REST: Record<NonNullable<Spell['mark']['free']>, keyof Texts> = {
    long: 'restLong',
    short: 'restShort',
    day: 'restDay',
  };

  function markState(spell: Spell): string {
    if (spell.mark.always) return t.spellAlwaysPrepared;
    if (spell.mark.prepared === true) return t.spellPrepared;
    if (spell.mark.prepared === false) return t.spellNotPrepared;
    return '';
  }

  /** Slot boxes ticked in order, clicking only those that differ (as on the Combat tab). */
  function setSlots(boxes: string[], used: number) {
    change(boxes.filter((box, i) => isOn(fields, box) !== i < used).map((click) => ({ click })));
  }
</script>

{#snippet mark(spell: Spell)}
  {@const cls = spell.mark.always ? 'always' : spell.mark.prepared ? 'prep' : 'no'}
  {#if spell.mark.prepared !== null && !spell.mark.always}
    <button
      type="button"
      class="mark {cls}"
      aria-pressed={spell.mark.prepared}
      aria-label={markLabel(spell)}
      title={markLabel(spell)}
      {disabled}
      onclick={() => tap(spell)}
    ></button>
  {:else}
    <span class="mark {spell.mark.prepared === null ? '' : cls}" aria-hidden="true"></span>
  {/if}
{/snippet}

{#snippet tags(spell: Spell, level: number)}
  {#if spell.mark.always}<span class="tag">{t.spellAlways}</span>{/if}
  {#if spell.mark.atWill && level > 0}<span class="tag">{t.spellAtWill}</span>{/if}
  {#if spell.mark.charges !== null}<span class="tag">{fill(t.spellCharges, { count: spell.mark.charges })}</span>{/if}
  {#if spell.concentration}<span class="tag plain">{t.spellConcentration}</span>{/if}
  {#if spell.ritual}<span class="tag plain">{t.spellRitual}</span>{/if}
{/snippet}

{#snippet free(spell: Spell)}
  {#if spell.mark.free !== null}
    <button
      type="button"
      class="free"
      class:used={spell.mark.freeUsed}
      aria-pressed={spell.mark.freeUsed}
      aria-label={markLabel(spell)}
      title={markLabel(spell)}
      {disabled}
      onclick={() => tap(spell)}>{spell.mark.freeUsed ? t.spellFreeUsed : t.spellFree}</button
    >
  {/if}
{/snippet}

<section class="panel" aria-labelledby="spells-title">
  <div class="bar">
    <h2 id="spells-title">{t.spells}</h2>
    <div class="seg" role="group" aria-label={t.spellsFilter}>
      <button type="button" aria-pressed={!showAll} onclick={() => (showAll = false)}>{t.spellsReady}</button>
      <button type="button" aria-pressed={showAll} onclick={() => (showAll = true)}>{t.spellsAll}</button>
    </div>
  </div>
  <div class="numbers">
    {#if sameNumbers && sources[0]}
      <span class="stat">{t.spellSaveDcShort} <b>{sources[0].dc}</b></span>
      <span class="stat">{t.spellAttackShort} <b>{sources[0].attack}</b></span>
    {/if}
    {#each sources as source, i (i)}
      {#if !sameNumbers}
        <span class="stat">
          <b>{shortTitle(source)}</b>
          {t.spellSaveDcShort} <b>{source.dc}</b> · {t.spellAttackShort} <b>{source.attack}</b>
        </span>
      {/if}
      {#if source.prepareMax !== null}
        <span class="stat" class:over={preparedCount(source) > source.prepareMax}
          >{fill(t.spellsPrepared, {
            source: shortTitle(source),
            count: preparedCount(source),
            max: source.prepareMax,
          })}</span
        >
      {/if}
    {/each}
  </div>
  <p class="hint">{t.spellsHowTo}</p>
</section>

{#each levels as block (block.level)}
  <section class="panel" aria-labelledby={`spell-level-${block.level}`}>
    <div class="level">
      <h2 id={`spell-level-${block.level}`}>{levelName(block.level)}</h2>
      {#if block.slots}
        {@const s = block.slots}
        <span class="slots">
          <Dots
            total={Math.min(s.total, s.boxes.length)}
            used={s.used}
            name={`${t.spellSlots} ${levelName(block.level)}`}
            {disabled}
            onchange={(used) => setSlots(s.boxes, used)}
            {t}
          />
          <small>{fill(t.slotsLeft, { left: s.total - s.used, total: s.total })}</small>
        </span>
      {/if}
    </div>
    <ul>
      {#each block.entries as entry (`${entry.spell.page}${entry.spell.row}`)}
        {@const spell = entry.spell}
        <li class:off={spell.mark.prepared === false}>
          {@render mark(spell)}
          <button type="button" class="spell" aria-haspopup="dialog" onclick={() => (details = entry)}>
            <span class="top">
              <span class="title">
                <span class="name">{spell.name}</span>
                {@render tags(spell, entry.level)}
                {#if entry.source !== main}<span class="from">· {shortTitle(entry.source)}</span>{/if}
              </span>
              <span class="meta">{meta(spell)}</span>
            </span>
            <span class="summary">{spell.summary}</span>
            {#if spell.options.length}
              <span class="options">{t.spellOptions}: {spell.options.map(optionName).join(', ')}</span>
            {/if}
          </button>
          {@render free(spell)}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="panel hint">{t.noReadySpells}</p>
{/each}

{#if shown && details && text}
  <Modal title={shown.fullName} onescape={() => (details = null)} closeLabel={t.close}>
    <p class="kind">{[text.kind || levelName(details.level), details.source.title].join(' · ')}</p>
    {#if markState(shown) || shown.mark.free !== null}
      <div class="state">
        {#if markState(shown)}
          {@render mark(shown)}<span>{markState(shown)}</span>
        {/if}
        {@render free(shown)}
      </div>
    {/if}
    {#if shown.mark.free !== null}
      <p class="note">{fill(t.spellFreeRest, { rest: t[REST[shown.mark.free]] })}</p>
    {/if}
    <dl>
      <dt>{t.castingTime}</dt>
      <dd>{shown.timeFull || time(shown)}</dd>
      {#if shown.range}<dt>{t.spellRange}</dt>
        <dd>{range(shown)}</dd>{/if}
      {#if shown.components}<dt>{t.spellComponents}</dt>
        <dd>
          {shown.components.replaceAll(',', ', ')}{#if shown.material}{' '}({shown.material}){/if}
        </dd>{/if}
      {#if shown.duration}<dt>{t.spellDuration}</dt>
        <dd>{shown.concentration ? `${t.concentration}, ` : ''}{shown.duration}</dd>{/if}
      {#if shown.save}<dt>{t.savingThrow}</dt>
        <dd>{save(shown)}</dd>{/if}
      {#if shown.bookPage}<dt>{t.spellSource}</dt>
        <dd>{shown.book} {shown.bookPage}</dd>{/if}
    </dl>
    {#if shown.needsSight}<p class="note">{t.needsSight}</p>{/if}
    {#each text.paragraphs as paragraph, i (i)}<p class="text">{paragraph}</p>{:else}<p class="text">
        {shown.summary}
      </p>{/each}
    {#if text.changes.length}
      <div class="changes">
        <b>{t.changedByFeatures}</b>
        {#each text.changes as line, i (i)}<p>{line}</p>{/each}
      </div>
    {/if}
    {#if shown.options.length}
      <h3>{t.spellOptions}</h3>
      <ul class="option-list">
        {#each shown.options as option (option.row)}
          <li><b>{optionName(option)}</b> · {meta(option)}<br />{option.summary}</li>
        {/each}
      </ul>
    {/if}
    {#if t.locale !== 'en'}<p class="note">{t.spellTextLanguage}</p>{/if}
  </Modal>
{/if}

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    container-type: inline-size;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
  }

  .seg {
    display: inline-flex;
  }

  .seg button {
    border-radius: 0;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .seg button:first-child {
    border-radius: 0.5rem 0 0 0.5rem;
  }

  .seg button:last-child {
    margin-left: -1px;
    border-radius: 0 0.5rem 0.5rem 0;
  }

  .seg button[aria-pressed='true'] {
    position: relative;
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .numbers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.125rem 1rem;
    margin-top: 0.5rem;
  }

  .stat,
  .hint,
  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .stat b {
    color: var(--ink);
    font-size: 1rem;
    font-weight: 800;
  }

  .hint {
    margin: 0.25rem 0 0;
  }

  /* More prepared than the class allows: MPMB lets it happen, the player should see it. */
  .stat.over {
    color: var(--danger);
    font-weight: 700;
  }

  p.panel.hint {
    margin: 0 0 0.625rem;
  }

  .level {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0 0.5rem;
    min-height: 44px;
    border-bottom: 2px solid var(--line);
  }

  .slots {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0 0.25rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  li:last-child {
    border-bottom: 0;
  }

  /* The mark: a 44 px button where it can be tapped, the same width where it can't. */
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
  }

  .mark::before {
    content: '';
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
  }

  .mark.prep::before {
    background: var(--accent);
  }

  .mark.no::before {
    box-shadow: inset 0 0 0 2px var(--used);
  }

  .mark.always::before {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 2px;
    background: var(--accent);
    transform: rotate(45deg);
  }

  .spell {
    display: grid;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0.375rem 0.5rem 0.375rem 0.25rem;
    /* No edge to see: the row reads as a list line, the whole of it is the button. */
    border: 0 solid transparent;
    border-radius: 0.375rem;
    background: none;
    text-align: left;
    line-height: 1.35;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0 0.75rem;
  }

  .name {
    font-weight: 700;
  }

  .off .name,
  .off .summary {
    color: var(--ink-muted);
  }

  .tag {
    display: inline-block;
    margin-left: 0.25rem;
    padding: 0 0.375rem;
    border-radius: 0.375rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
    vertical-align: 0.1rem;
  }

  .tag.plain {
    background: var(--hover);
    color: var(--ink-muted);
  }

  .from,
  .meta,
  .options {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .meta {
    white-space: nowrap;
  }

  .summary {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  /* Narrow columns (the iPad, the laptop's 1280 px): the casting time and range get their own line. */
  @container (max-width: 540px) {
    .top {
      display: block;
    }

    .meta {
      display: block;
      white-space: normal;
    }
  }

  .free {
    flex: none;
    align-self: center;
    padding: 0 0.625rem;
    border-color: var(--accent);
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .free.used {
    border-color: var(--line);
    color: var(--ink-muted);
    text-decoration: line-through;
  }

  /* The pop-up. */
  .kind {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
  }

  .state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.125rem 1rem;
    margin: 0 0 0.75rem;
    font-size: 0.9375rem;
  }

  dt {
    color: var(--ink-muted);
  }

  dd {
    margin: 0;
  }

  .text {
    margin: 0 0 0.5rem;
  }

  .note {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .changes {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-left: 3px solid var(--accent);
    border-radius: 0 0.5rem 0.5rem 0;
    background: var(--accent-soft);
    font-size: 0.9375rem;
  }

  .changes p {
    margin: 0.25rem 0 0;
  }

  h3 {
    margin: 0.75rem 0 0.25rem;
    font-size: 1rem;
  }

  .option-list li {
    display: block;
    padding: 0.25rem 0;
    font-size: 0.9375rem;
  }
</style>
