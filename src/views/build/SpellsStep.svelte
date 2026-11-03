<!--
  Build step "Spells" (M7, Nick picked a Build step, 2026-11-03): each of MPMB's spell sources (a class, a
  feat, a species, an item) with what its SPELL SELECTION DIALOG holds. The player picks a class's cantrips
  and spells here; "Update spell sheet" hands the picks to MPMB's own dialogs and has MPMB make the spell
  sheet pages again, as "(Re)generate a Spell Sheet" does in Acrobat (engine/spells.ts).
-->
<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import {
    byLevel,
    changeCount,
    draftOf,
    fillState,
    pickable,
    picksOf,
    textParts,
    toggled,
  } from '../../build/spells.ts';
  import type { AddFilter, SpellDraft } from '../../build/spells.ts';
  import type { SpellInfo, SpellPicks, SpellSource, SpellsInfo } from '../../engine/spells.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES } from '../../play/read.ts';
  import { readSpells } from '../../play/spells.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { FieldViews } from '../../worker/views.ts';
  import SpellAddList from './SpellAddList.svelte';

  interface Props {
    /** What MPMB's spell dialogs offer and hold now; null while the sheet isn't open. */
    load: () => Promise<SpellsInfo | null>;
    /** Hands the picks to MPMB's dialogs and makes the spell sheet again. */
    apply: (picks: SpellPicks[]) => Promise<void>;
    fields: FieldViews;
    disabled: boolean;
    t: Texts;
  }

  let { load, apply, fields, disabled, t }: Props = $props();

  let info = $state<SpellsInfo | null>(null);
  let drafts = $state<Record<string, SpellDraft>>({});
  let chosenKey = $state<string | null>(null);
  let busy = $state(false);
  /** The add list in a pop-up (narrow screens), with the filter it opens on. */
  let adding = $state<{ start: AddFilter | null } | null>(null);
  let reading = $state<SpellInfo | null>(null);

  /** Wide enough for the add list next to the chosen spells (the laptops, the iPad across). */
  const wide = new MediaQuery('min-width: 1100px');

  async function reload() {
    const fresh = await load();
    if (!fresh) return;
    info = fresh;
    drafts = Object.fromEntries(fresh.sources.map((s) => [s.key, draftOf(s)]));
  }

  $effect(() => {
    void reload();
  });

  /** The class the player most likely came for: the first source with something to pick. */
  const source = $derived(
    info?.sources.find((s) => s.key === chosenKey) ?? info?.sources.find(pickable) ?? info?.sources[0] ?? null,
  );
  const draft = $derived(source ? (drafts[source.key] ?? draftOf(source)) : null);
  const changes = $derived(info ? changeCount(info, drafts) : 0);

  /** The save DC and attack bonus MPMB put on the sheet for this source, once there is a sheet. */
  const numbers = $derived(source ? readSpells(fields).find((s) => s.key === source.key) : undefined);

  const levelName = (level: number): string => (level === 0 ? t.cantrips : fill(t.slotLevel, { count: level }));

  const TIMES: Record<string, keyof Texts> = { Act: 'action', Bns: 'bonusAction', React: 'reaction' };
  const WORDS: Record<string, keyof Texts> = { Self: 'spellSelf', Touch: 'spellTouch', Instantaneous: 'spellInstant' };
  const word = (text: string, words: Record<string, keyof Texts>): string => {
    const key = words[text];
    return key ? String(t[key]) : text;
  };
  const SCHOOLS = [
    'Abjuration',
    'Conjuration',
    'Divination',
    'Enchantment',
    'Evocation',
    'Illusion',
    'Necromancy',
    'Transmutation',
  ] as const;
  const school = (spell: SpellInfo): string => {
    const known = SCHOOLS.find((s) => s === spell.school);
    return known ? t[`school_${known}`] : spell.school;
  };
  // MPMB writes "S:9-m rad" for an area around the caster, as on the Spells tab.
  const range = (spell: SpellInfo): string => word(spell.range, WORDS).replace(/^S:\s*/, `${t.spellSelf}, `);
  /** The line under a spell's name: school, casting time, range. */
  const line = (spell: SpellInfo): string =>
    [school(spell), word(spell.time, TIMES), range(spell)].filter(Boolean).join(' · ');

  /** What a source's button says it holds. */
  function partsLine(s: SpellSource): string {
    const d = drafts[s.key] ?? draftOf(s);
    const parts: string[] = [];
    if (s.cantrips) parts.push(fill(t.spellsPartCantrips, { n: d.cantrips.length, max: s.cantrips.count }));
    // A class that prepares from its whole list (a paladin) has no spell drop-downs in MPMB's dialog.
    if (s.type === 'list') parts.push(t.spellsPartList);
    else if (s.spells && s.type === 'book') parts.push(fill(t.spellsPartBook, { n: d.spells.length }));
    else if (s.spells) parts.push(fill(t.spellsPartSpells, { n: d.spells.length, max: s.spells.count }));
    const bonus = s.bonus.filter((b) => b.chosen).length;
    if (bonus) parts.push(counted(t.spellsPartBonusOne, t.spellsPartBonus, bonus));
    return parts.join(' · ');
  }

  /** Still open: fewer cantrips or spells known than MPMB gives (a spellbook has no fixed number). */
  function isOpen(s: SpellSource): boolean {
    const d = drafts[s.key] ?? draftOf(s);
    const cantripsOpen = s.cantrips !== null && fillState(d.cantrips.length, s.cantrips.count) === 'open';
    const spellsOpen = s.spells !== null && s.type === 'known' && fillState(d.spells.length, s.spells.count) === 'open';
    return cantripsOpen || spellsOpen;
  }

  function toggle(part: 'cantrips' | 'spells', key: string) {
    if (!source || !draft) return;
    drafts[source.key] = { ...draft, [part]: toggled(draft[part], key) };
  }

  /** "On the spell sheet": MPMB's own choices, without "only prepared" until the app can pick those. */
  const showOptions = $derived(source ? source.showOptions.filter((o) => o.id !== 3 || o.id === source.show) : []);
  const showLabel = (id: number, name: string): string => {
    const labels: Record<number, string> = {
      1: fill(t.spellsShow1, { level: source?.maxLevel ?? 0 }),
      2: t.spellsShow2,
      3: t.spellsShow3,
      4: t.spellsShow4,
    };
    return labels[id] ?? name;
  };

  async function update() {
    if (!info || busy) return;
    busy = true;
    try {
      // A plain copy: the drafts are Svelte state (proxies), which can't go to the worker as they are.
      await apply($state.snapshot(picksOf(info, drafts)));
      await reload();
    } finally {
      busy = false;
    }
  }

  const saveText = (spell: SpellInfo): string => {
    if (!spell.save) return '';
    const ability = ABILITIES.find((a) => a === spell.save);
    return fill(t.spellSave, { ability: ability ? t[`short${ability}`] : spell.save });
  };
</script>

{#snippet row(key: string, part: 'cantrips' | 'spells' | null, tag: string)}
  {@const spell = info?.spells[key]}
  <li>
    {#if spell}
      <button
        type="button"
        class="name"
        aria-label={fill(t.spellsInfoLabel, { name: spell.name })}
        onclick={() => (reading = spell)}
      >
        <b>{spell.name}</b>
        {#if tag}<span class="tag">{tag}</span>{/if}
        {#if spell.ritual}<span class="tag">{t.spellRitual}</span>{/if}
        <small>{line(spell)}</small>
      </button>
    {:else}
      <span class="name"><b>{key}</b></span>
    {/if}
    {#if part}
      {@const name = spell?.name ?? key}
      <button
        type="button"
        class="quiet icon"
        aria-label={fill(t.spellsRemoveLabel, { name })}
        title={fill(t.spellsRemoveLabel, { name })}
        disabled={disabled || busy}
        onclick={() => toggle(part, key)}>✕</button
      >
    {/if}
  </li>
{/snippet}

{#snippet more(open: number, start: AddFilter)}
  {#if open > 0 && !wide.current}
    <button type="button" class="more" disabled={disabled || busy} onclick={() => (adding = { start })}
      >{counted(t.spellsMoreToChooseOne, t.spellsMoreToChoose, open)}</button
    >
  {:else if open > 0}
    <p class="more">{counted(t.spellsMoreToChooseOne, t.spellsMoreToChoose, open)}</p>
  {/if}
{/snippet}

<section class="card" aria-labelledby="spells-title">
  <header class="head">
    <div>
      <h2 id="spells-title">{t.buildSpellsStep}</h2>
      <p class="line">{t.spellsStepLine}</p>
    </div>
    {#if numbers?.dc || numbers?.attack}
      <div class="numbers">
        {#if numbers.dc}<span class="badge"><small>{t.spellSaveDcShort}</small>{numbers.dc}</span>{/if}
        {#if numbers.attack}<span class="badge"><small>{t.spellAttackShort}</small>{numbers.attack}</span>{/if}
      </div>
    {/if}
  </header>

  {#if !info}
    <p class="muted">{t.opening}</p>
  {:else if !info.sources.length || !source || !draft}
    <p class="note">{t.spellsNone}</p>
  {:else}
    <div class="sources" role="group" aria-label={t.spellsSources}>
      {#each info.sources as s (s.key)}
        <button
          type="button"
          class="source"
          aria-pressed={s.key === source.key}
          onclick={() => {
            chosenKey = s.key;
            adding = null;
          }}
        >
          <b>
            {#if pickable(s)}
              <span class="dot" class:open={isOpen(s)} aria-hidden="true"></span>
              <span class="sr">{isOpen(s) ? t.spellsOpen : t.spellsDone}</span>
            {/if}
            {s.name}
          </b>
          <small>{partsLine(s)}</small>
        </button>
      {/each}
    </div>

    <div class="panes" class:split={wide.current && pickable(source)}>
      <div class="chosen">
        {#if source.cantrips}
          {@const state = fillState(draft.cantrips.length, source.cantrips.count)}
          <h3>
            {t.cantrips}
            <span class="chip {state}"
              >{fill(t.spellsOf, { n: draft.cantrips.length, max: source.cantrips.count })}</span
            >
          </h3>
          <ul>
            {#each byLevel(draft.cantrips, info.spells).flatMap((g) => g.keys) as key (key)}
              {@render row(key, 'cantrips', '')}
            {/each}
          </ul>
          {@render more(source.cantrips.count - draft.cantrips.length, { part: 'cantrips' })}
          {#if state === 'over'}<p class="muted">{t.spellsOver}</p>{/if}
        {/if}

        {#if source.type === 'list'}
          <p class="note">{fill(t.spellsWholeList, { name: source.name })}</p>
        {:else if source.spells}
          {@const book = source.type === 'book'}
          {@const state = fillState(draft.spells.length, source.spells.count)}
          <h3>
            {book ? t.spellsBook : t.spellsKnown}
            <span class="chip {book ? 'book' : state}"
              >{book
                ? counted(t.spellsBookCountOne, t.spellsBookCount, draft.spells.length)
                : fill(t.spellsOf, { n: draft.spells.length, max: source.spells.count })}</span
            >
          </h3>
          <p class="muted">{book ? t.spellsBookLine : fill(t.spellsKnownLine, { level: source.maxLevel })}</p>
          {#each byLevel(draft.spells, info.spells) as group (group.level)}
            <h4>{group.level === Number.MAX_SAFE_INTEGER ? '–' : levelName(group.level)}</h4>
            <ul>
              {#each group.keys as key (key)}
                {@render row(key, 'spells', '')}
              {/each}
            </ul>
          {/each}
          {#if !book}
            {@render more(source.spells.count - draft.spells.length, { part: 'spells', level: source.maxLevel || 1 })}
            {#if state === 'over'}<p class="muted">{t.spellsOver}</p>{/if}
          {/if}
        {/if}

        {#if source.extra?.spells.length}
          <h3>{t.spellsExtra}</h3>
          {#if source.extra.label}<p class="muted">{source.extra.label}</p>{/if}
          <ul>
            {#each source.extra.spells as key (key)}
              {@render row(key, null, '')}
            {/each}
          </ul>
        {/if}

        {#if source.bonus.some((b) => b.chosen)}
          <h3>{pickable(source) || source.type === 'list' ? t.spellsFromFeatures : t.spells}</h3>
          <ul>
            {#each source.bonus.filter((b) => b.chosen) as bonus, i (i)}
              {@render row(bonus.chosen, null, bonus.name)}
            {/each}
          </ul>
        {/if}
        {#if !pickable(source) && source.type !== 'list'}
          <p class="note">{fill(t.spellsFromSource, { name: source.name })}</p>
        {/if}

        {#if showOptions.length > 1}
          <label class="show">
            <span>{t.spellsShow}</span>
            <select
              value={draft.show}
              disabled={disabled || busy}
              onchange={(e) => (drafts[source.key] = { ...draft, show: Number(e.currentTarget.value) })}
            >
              {#each showOptions as option (option.id)}
                <option value={option.id}>{showLabel(option.id, option.name)}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>

      {#if wide.current && pickable(source)}
        <div class="adder">
          <h3>{t.spellsAddTitle}</h3>
          <p class="muted">{fill(t.spellsAddLine, { name: source.name })}</p>
          {#key source.key}
            <SpellAddList
              {source}
              spells={info.spells}
              {draft}
              start={null}
              ontoggle={toggle}
              oninfo={(s) => (reading = s)}
              {line}
              {t}
            />
          {/key}
        </div>
      {/if}
    </div>

    <footer class="bar">
      <p class="muted">
        {changes ? counted(t.spellsChangedOne, t.spellsChanged, changes) : t.spellsUpToDate}
      </p>
      <div class="acts">
        {#if !wide.current && pickable(source)}
          <button type="button" class="add" disabled={disabled || busy} onclick={() => (adding = { start: null })}
            >{t.spellsAddOpen}</button
          >
        {/if}
        <button type="button" class="primary" disabled={disabled || busy || !changes} onclick={update}
          >{busy ? t.spellsUpdating : t.spellsUpdate}</button
        >
      </div>
    </footer>
  {/if}
</section>

{#if adding && info && source && draft && pickable(source)}
  <Modal title={t.spellsAddTitle} onescape={() => (adding = null)} closeLabel={t.close} wide>
    <p class="muted">{fill(t.spellsAddLine, { name: source.name })}</p>
    <SpellAddList
      {source}
      spells={info.spells}
      {draft}
      start={adding.start}
      ontoggle={toggle}
      oninfo={(s) => (reading = s)}
      {line}
      {t}
    />
    {#snippet actions()}
      <button type="button" class="primary" onclick={() => (adding = null)}>{t.spellsAddDone}</button>
    {/snippet}
  </Modal>
{/if}

{#if reading}
  <Modal title={reading.name} onescape={() => (reading = null)} closeLabel={t.close}>
    <p class="muted">{[levelName(reading.level), school(reading)].join(' · ')}</p>
    <dl>
      <dt>{t.castingTime}</dt>
      <dd>{word(reading.time, TIMES)}</dd>
      {#if reading.range}<dt>{t.spellRange}</dt>
        <dd>{range(reading)}</dd>{/if}
      {#if reading.components}<dt>{t.spellComponents}</dt>
        <dd>{reading.components.replaceAll(',', ', ')}</dd>{/if}
      {#if reading.duration}<dt>{t.spellDuration}</dt>
        <dd>{reading.concentration ? `${t.concentration}, ` : ''}{word(reading.duration, WORDS)}</dd>{/if}
      {#if reading.save}<dt>{t.savingThrow}</dt>
        <dd>{saveText(reading)}</dd>{/if}
      {#if reading.source}<dt>{t.spellSource}</dt>
        <dd>{reading.source}</dd>{/if}
    </dl>
    {#each textParts(reading.full) as paragraph, i (i)}
      <p class="text">
        {#each paragraph as part, j (j)}{#if part.bold}<b>{part.text}</b>{:else}{part.text}{/if}{/each}
      </p>
    {:else}
      <p class="text">{reading.description}</p>
    {/each}
    {#if t.locale !== 'en'}<p class="muted">{t.spellTextLanguage}</p>{/if}
  </Modal>
{/if}

<style>
  .card {
    min-width: 0;
    padding: 1rem 1.25rem 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .line,
  .muted {
    margin: 0.125rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .line {
    font-size: 1rem;
  }

  .numbers {
    display: flex;
    flex: none;
    gap: 0.5rem;
  }

  .badge {
    display: grid;
    place-items: center;
    min-width: 4.5rem;
    padding: 0.125rem 0.5rem;
    border: 2px solid var(--accent);
    border-radius: 0.625rem;
    color: var(--accent);
    font-size: 1.25rem;
    font-weight: 800;
    line-height: 1.15;
  }

  .badge small {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .source {
    display: grid;
    min-height: 48px;
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    text-align: left;
    line-height: 1.25;
  }

  .source[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 -3px 0 var(--accent);
  }

  .source small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 400;
  }

  .dot {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.25rem;
    border-radius: 50%;
    background: var(--ok);
    vertical-align: middle;
  }

  .dot.open {
    background: var(--danger);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .panes {
    display: grid;
    gap: 1rem;
  }

  .panes.split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .chosen,
  .adder {
    min-width: 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  /* The add list stays in view while the chosen spells scroll by. */
  .adder {
    position: sticky;
    top: 0.75rem;
    max-height: calc(100dvh - 7rem);
    overflow-y: auto;
  }

  h3 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin: 0.75rem 0 0.25rem;
    font-size: 1rem;
  }

  h3:first-child {
    margin-top: 0;
  }

  h4 {
    margin: 0.75rem 0 0;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--line);
    color: var(--ink-muted);
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .chip {
    padding: 0 0.5rem;
    border-radius: 1rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .chip.full {
    background: color-mix(in srgb, var(--ok) 18%, transparent);
    color: var(--ok);
  }

  .chip.over {
    background: color-mix(in srgb, var(--danger) 15%, transparent);
    color: var(--danger);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    border-bottom: 1px solid var(--line);
  }

  .name {
    display: block;
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0;
    border: 0;
    background: none;
    text-align: left;
    line-height: 1.3;
  }

  .name:not(:disabled):hover {
    background: none;
  }

  .name small {
    display: block;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 400;
  }

  .tag {
    margin-left: 0.375rem;
    padding: 0 0.375rem;
    border-radius: 0.25rem;
    background: var(--hover);
    color: var(--ink-muted);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .icon {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    padding: 0;
  }

  .more {
    display: block;
    width: 100%;
    min-height: 48px;
    margin: 0.5rem 0 0;
    padding: 0.5rem 0.75rem;
    border: 1px dashed var(--line);
    border-radius: 0.5rem;
    background: none;
    color: var(--ink-muted);
    text-align: left;
  }

  p.more {
    min-height: 0;
  }

  .note {
    margin: 0.75rem 0 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    font-size: 0.875rem;
  }

  .show {
    display: grid;
    gap: 0.25rem;
    margin-top: 1rem;
    font-weight: 700;
  }

  .show select {
    min-height: 44px;
    font-weight: 400;
  }

  /* The one main action, always in reach at the bottom of the screen. */
  .bar {
    position: sticky;
    bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin: 1rem -1.25rem 0;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--line);
    border-radius: 0 0 0.75rem 0.75rem;
    background: var(--surface);
  }

  .bar p {
    flex: 1 1 14rem;
    margin: 0;
  }

  /* On the iPad upright the text takes its own line and the two buttons share the next. */
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-left: auto;
  }

  .bar .add {
    border-style: dashed;
    color: var(--accent);
    font-weight: 700;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.125rem 1rem;
    margin: 0.5rem 0 0.75rem;
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
</style>
