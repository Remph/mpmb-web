<!--
  Build step "Spells" (M7, Nick picked a Build step, 2026-11-03): each of MPMB's spell sources (a class, a
  feat, a species, an item) with what its SPELL SELECTION DIALOG holds, and "Spell sheet" with MPMB's order
  dialog. The player picks a class's cantrips and spells, the bonus spells of feats and items, the spells
  for "Prepared spells only", and the sheet's order and options; "Update spell sheet" hands it all to MPMB's
  own dialogs and has MPMB make the spell sheet pages again, as "(Re)generate a Spell Sheet" does in Acrobat
  (engine/spells.ts).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { unsentFor, unsentSpells } from '../../build/spell-drafts.svelte.ts';
  import {
    SHEET_OPTIONS,
    bonusPickable,
    byLevel,
    changeCount,
    draftOf,
    fillState,
    hasAddList,
    moved,
    pickable,
    picksOf,
    preparing,
    sheetChangeCount,
    sheetDraftOf,
    sheetPicksOf,
    switched,
    textParts,
    toggled,
  } from '../../build/spells.ts';
  import type { AddFilter, SheetDraft, SpellDraft, SpellListPart } from '../../build/spells.ts';
  import type { SpellInfo, SpellPicks, SpellSheetPicks, SpellSource, SpellsInfo } from '../../engine/spells.ts';
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
    apply: (picks: SpellPicks[], sheet: SpellSheetPicks | null) => Promise<void>;
    fields: FieldViews;
    /** The character and when it was last saved: unsent picks stay while the sheet is the same. */
    characterId: string;
    updated: string;
    disabled: boolean;
    t: Texts;
  }

  let { load, apply, fields, characterId, updated, disabled, t }: Props = $props();

  let info = $state<SpellsInfo | null>(null);
  let drafts = $state<Record<string, SpellDraft>>({});
  let chosenKey = $state<string | null>(null);
  let busy = $state(false);
  let sheetDraft = $state<SheetDraft | null>(null);
  /** The add list in a pop-up (narrow screens), with the filter it opens on. */
  let adding = $state<{ start: AddFilter | null } | null>(null);
  let reading = $state<SpellInfo | null>(null);
  /** The bonus spell whose list is open, by its place in the dialog. */
  let bonusPicking = $state<number | null>(null);
  /** A spellbook with "Prepared spells only" has two lists to add from; the player switches. */
  let addMode = $state<'pick' | 'prepare'>('pick');

  /** The "Spell sheet" button's key among the sources' keys (MPMB's keys never start with "#"). */
  const SHEET = '#sheet';

  /** Wide enough for the add list next to the chosen spells (the laptops, the iPad across). */
  const wide = new MediaQuery('min-width: 1100px');

  async function reload() {
    const fresh = await load();
    if (!fresh) return;
    info = fresh;
    // Picks made before the player left the step, if nothing was saved since.
    const kept = untrack(() => unsentFor(characterId, updated));
    drafts = Object.fromEntries(fresh.sources.map((s) => [s.key, kept?.drafts[s.key] ?? draftOf(s)]));
    sheetDraft = kept?.sheet ?? sheetDraftOf(fresh);
  }

  $effect(() => {
    void reload();
  });

  /** The class the player most likely came for: the first source with something to pick. */
  const source = $derived(
    info?.sources.find((s) => s.key === chosenKey) ?? info?.sources.find(pickable) ?? info?.sources[0] ?? null,
  );
  const draft = $derived(source ? (drafts[source.key] ?? draftOf(source)) : null);
  const changes = $derived(info ? changeCount(info, drafts) + sheetChangeCount(info, sheetDraft) : 0);
  const onSheet = $derived(chosenKey === SHEET && sheetDraft !== null);

  // Keeps the picks for when the player comes back to the step (spell-drafts.svelte.ts).
  $effect(() => {
    if (!info) return;
    unsentSpells[characterId] = {
      updated: untrack(() => updated),
      drafts: $state.snapshot(drafts),
      sheet: $state.snapshot(sheetDraft),
      changes,
    };
  });
  const addable = $derived(!onSheet && source !== null && draft !== null && hasAddList(source, draft));
  /** What the add list adds to: a source with nothing else to pick prepares; a spellbook may do both. */
  const mode = $derived<'pick' | 'prepare'>(
    !source || !draft || !preparing(source, draft) ? 'pick' : !pickable(source) ? 'prepare' : addMode,
  );
  const preparedFull = $derived(source?.prepared && draft ? draft.prepared.length >= source.prepared.count : false);
  const pickingBonus = $derived(bonusPicking !== null ? (source?.bonus[bonusPicking] ?? null) : null);
  const nameOf = (key: string): string => info?.sources.find((s) => s.key === key)?.name ?? key;

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
    if (preparing(s, d)) parts.push(fill(t.spellsPartPrepared, { n: d.prepared.length }));
    const bonus = d.bonus.filter(Boolean).length;
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

  function toggle(part: SpellListPart, key: string) {
    if (!source || !draft || disabled || busy) return;
    // MPMB's prepared spells dialog has only as many rows as the character may prepare.
    if (part === 'prepared' && preparedFull && !draft.prepared.includes(key)) return;
    drafts[source.key] = { ...draft, [part]: toggled(draft[part], key) };
  }

  function setBonus(index: number, key: string) {
    if (!source || !draft || disabled || busy) return;
    drafts[source.key] = { ...draft, bonus: draft.bonus.map((k, i) => (i === index ? key : k)) };
  }

  /** "On the spell sheet": MPMB's own choices. */
  const showOptions = $derived(source ? source.showOptions : []);
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
      await apply($state.snapshot(picksOf(info, drafts)), $state.snapshot(sheetPicksOf(info, sheetDraft)));
      // Sent: the step starts again from what MPMB has now.
      delete unsentSpells[characterId];
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

{#snippet row(key: string, part: SpellListPart | null, tag: string)}
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
        {#if spell.concentration}<span class="tag">{t.spellConcentration}</span>{/if}
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

{#snippet bonusRow(s: SpellSource, index: number, key: string, tag: string)}
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
        <span class="tag">{tag}</span>
        <small>{line(spell)}</small>
      </button>
    {:else}
      <span class="name"><b>{key}</b> <span class="tag">{tag}</span></span>
    {/if}
    {#if bonusPickable(s, index)}
      <button
        type="button"
        class="change"
        aria-label={fill(t.spellsBonusChangeLabel, { name: tag })}
        disabled={disabled || busy}
        onclick={() => (bonusPicking = index)}>{t.spellsChange}</button
      >
    {/if}
  </li>
{/snippet}

{#snippet addHead(s: SpellSource, heading = true)}
  {#if s.prepared && draft && preparing(s, draft) && pickable(s)}
    <div class="seg" role="group" aria-label={t.spellsAddTitle}>
      <button type="button" aria-pressed={mode === 'pick'} onclick={() => (addMode = 'pick')}
        >{s.type === 'book' ? t.spellsBook : t.spellsKnown}</button
      >
      <button type="button" aria-pressed={mode === 'prepare'} onclick={() => (addMode = 'prepare')}
        >{t.spellsPrepareShort}</button
      >
    </div>
  {:else if heading}
    <h3>{mode === 'prepare' ? t.spellsPrepareTitle : t.spellsAddTitle}</h3>
  {/if}
  <p class="muted">{fill(mode === 'prepare' ? t.spellsPrepareLine : t.spellsAddLine, { name: s.name })}</p>
  {#if mode === 'prepare' && preparedFull && s.prepared}
    <p class="note">{fill(t.spellsPreparedFull, { count: s.prepared.count })}</p>
  {/if}
{/snippet}

{#snippet sheetPane(sheet: SheetDraft)}
  <div class="chosen sheet">
    <h3>{t.spellsSheetOrder}</h3>
    <p class="muted">{t.spellsSheetOrderLine}</p>
    <ol class="order">
      {#each sheet.included as key, i (key)}
        <li>
          <span class="name"><b>{nameOf(key)}</b></span>
          <button
            type="button"
            class="quiet icon"
            aria-label={fill(t.spellsUpLabel, { name: nameOf(key) })}
            title={fill(t.spellsUpLabel, { name: nameOf(key) })}
            disabled={disabled || busy || i === 0}
            onclick={() => (sheetDraft = { ...sheet, included: moved(sheet.included, key, -1) })}>↑</button
          >
          <button
            type="button"
            class="quiet icon"
            aria-label={fill(t.spellsDownLabel, { name: nameOf(key) })}
            title={fill(t.spellsDownLabel, { name: nameOf(key) })}
            disabled={disabled || busy || i === sheet.included.length - 1}
            onclick={() => (sheetDraft = { ...sheet, included: moved(sheet.included, key, 1) })}>↓</button
          >
          <button
            type="button"
            class="change"
            aria-label={fill(t.spellsLeaveOffLabel, { name: nameOf(key) })}
            disabled={disabled || busy}
            onclick={() => (sheetDraft = switched(sheet, key))}>{t.spellsLeaveOff}</button
          >
        </li>
      {/each}
    </ol>
    {#if sheet.excluded.length}
      <h4>{t.spellsLeftOff}</h4>
      <ul>
        {#each sheet.excluded as key (key)}
          <li>
            <span class="name"><b>{nameOf(key)}</b></span>
            <button
              type="button"
              class="change"
              aria-label={fill(t.spellsPutBackLabel, { name: nameOf(key) })}
              disabled={disabled || busy}
              onclick={() => (sheetDraft = switched(sheet, key))}>{t.spellsPutBack}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
    <h3>{t.spellsSheetOptions}</h3>
    {#each SHEET_OPTIONS as option (option)}
      <label class="option">
        <input
          type="checkbox"
          checked={sheet.options[option]}
          disabled={disabled || busy}
          onchange={(e) =>
            (sheetDraft = { ...sheet, options: { ...sheet.options, [option]: e.currentTarget.checked } })}
        />
        <span>{t[`spellsOpt_${option}`]}</span>
      </label>
    {/each}
  </div>
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
            {#if hasAddList(s, drafts[s.key] ?? draftOf(s))}
              <span class="dot" class:open={isOpen(s)} aria-hidden="true"></span>
              <span class="sr">{isOpen(s) ? t.spellsOpen : t.spellsDone}</span>
            {/if}
            {s.name}
          </b>
          <small>{partsLine(s)}</small>
        </button>
      {/each}
      {#if sheetDraft}
        <button
          type="button"
          class="source"
          aria-pressed={onSheet}
          onclick={() => {
            chosenKey = SHEET;
            adding = null;
          }}
        >
          <b>{t.spellsSheet}</b>
          <small>{t.spellsSheetLine}</small>
        </button>
      {/if}
    </div>

    {#if onSheet && sheetDraft}
      {@render sheetPane(sheetDraft)}
    {:else}
      <div class="panes" class:split={wide.current && addable}>
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

          {#if source.prepared && preparing(source, draft)}
            {@const state = fillState(draft.prepared.length, source.prepared.count)}
            <h3>
              {t.spellsPreparedTitle}
              <span class="chip {state}"
                >{fill(t.spellsOf, { n: draft.prepared.length, max: source.prepared.count })}</span
              >
            </h3>
            <p class="muted">{fill(t.spellsPreparedLine, { name: source.name, count: source.prepared.count })}</p>
            {#each byLevel(draft.prepared, info.spells) as group (group.level)}
              <h4>{group.level === Number.MAX_SAFE_INTEGER ? '–' : levelName(group.level)}</h4>
              <ul>
                {#each group.keys as key (key)}
                  {@render row(key, 'prepared', '')}
                {/each}
              </ul>
            {/each}
            {#if state === 'open' && !wide.current}
              <button
                type="button"
                class="more"
                disabled={disabled || busy}
                onclick={() => {
                  addMode = 'prepare';
                  adding = { start: null };
                }}
                >{counted(
                  t.spellsMoreToChooseOne,
                  t.spellsMoreToChoose,
                  source.prepared.count - draft.prepared.length,
                )}</button
              >
            {:else if state === 'open'}
              <p class="more">
                {counted(t.spellsMoreToChooseOne, t.spellsMoreToChoose, source.prepared.count - draft.prepared.length)}
              </p>
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

          {#if source.bonus.some((b, i) => draft.bonus[i] || bonusPickable(source, i))}
            <h3>{pickable(source) || source.type === 'list' ? t.spellsFromFeatures : t.spells}</h3>
            <ul>
              {#each source.bonus as bonus, i (i)}
                {@const key = draft.bonus[i] ?? ''}
                {#if key}
                  {@render bonusRow(source, i, key, bonus.name)}
                {:else if bonusPickable(source, i)}
                  <li>
                    <button
                      type="button"
                      class="more pick"
                      disabled={disabled || busy}
                      onclick={() => (bonusPicking = i)}>{fill(t.spellsBonusPick, { name: bonus.name })}</button
                    >
                  </li>
                {/if}
              {/each}
            </ul>
          {/if}
          {#if !pickable(source) && source.type !== 'list' && !source.bonus.some((_, i) => bonusPickable(source, i))}
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

        {#if wide.current && addable}
          <div class="adder">
            {@render addHead(source)}
            {#key `${source.key}|${mode}`}
              <SpellAddList
                {source}
                spells={info.spells}
                {draft}
                start={null}
                {mode}
                full={mode === 'prepare' && preparedFull}
                disabled={disabled || busy}
                ontoggle={toggle}
                oninfo={(s) => (reading = s)}
                {line}
                {t}
              />
            {/key}
          </div>
        {/if}
      </div>
    {/if}

    <footer class="bar">
      <p class="muted">
        {changes ? counted(t.spellsChangedOne, t.spellsChanged, changes) : t.spellsUpToDate}
      </p>
      <div class="acts">
        {#if !wide.current && addable}
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

{#if adding && info && source && draft && addable}
  <Modal
    title={mode === 'prepare' ? t.spellsPrepareTitle : t.spellsAddTitle}
    onescape={() => (adding = null)}
    closeLabel={t.close}
    wide
  >
    {@render addHead(source, false)}
    {#key mode}
      <SpellAddList
        {source}
        spells={info.spells}
        {draft}
        start={adding.start}
        {mode}
        full={mode === 'prepare' && preparedFull}
        disabled={disabled || busy}
        ontoggle={toggle}
        oninfo={(s) => (reading = s)}
        {line}
        {t}
      />
    {/key}
    {#snippet actions()}
      <button type="button" class="primary" onclick={() => (adding = null)}>{t.spellsAddDone}</button>
    {/snippet}
  </Modal>
{/if}

{#if pickingBonus && bonusPicking !== null && info && source && draft}
  {@const index = bonusPicking}
  {@const bonus = pickingBonus}
  <Modal
    title={fill(t.spellsBonusTitle, { name: bonus.name })}
    onescape={() => (bonusPicking = null)}
    closeLabel={t.close}
    wide
  >
    <p class="muted">{fill(t.spellsAddLine, { name: source.name })}</p>
    <ul class="picks">
      {#each byLevel(bonus.list, info.spells).flatMap((g) => g.keys) as key (key)}
        {@const spell = info.spells[key]}
        {@const on = draft.bonus[index] === key}
        <li>
          {#if spell}
            <button
              type="button"
              class="name"
              aria-label={fill(t.spellsInfoLabel, { name: spell.name })}
              onclick={() => (reading = spell)}
            >
              <b>{spell.name}</b>
              <small>{[levelName(spell.level), line(spell)].join(' · ')}</small>
            </button>
          {:else}
            <span class="name"><b>{key}</b></span>
          {/if}
          <button
            type="button"
            class="toggle"
            class:on
            aria-pressed={on}
            disabled={disabled || busy}
            aria-label={fill(on ? t.spellsPickedLabel : t.spellsPickLabel, { name: spell?.name ?? key })}
            onclick={() => setBonus(index, key)}>{on ? t.spellsPicked : t.spellsPick}</button
          >
        </li>
      {/each}
    </ul>
    {#snippet actions()}
      <button type="button" class="primary" onclick={() => (bonusPicking = null)}>{t.spellsAddDone}</button>
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
  .change {
    flex: none;
    padding: 0 0.75rem;
    color: var(--accent);
    font-weight: 700;
  }

  .more.pick {
    margin: 0.25rem 0;
    color: var(--accent);
    font-weight: 700;
  }

  li:has(.more.pick) {
    border-bottom: 0;
  }

  .seg {
    display: inline-flex;
    overflow: hidden;
    margin-bottom: 0.25rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    color: var(--ink-muted);
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .order {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 48px;
    border-bottom: 1px solid var(--line);
  }

  .option input {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    accent-color: var(--accent);
  }

  .picks .toggle {
    flex: none;
    padding: 0 0.75rem;
    color: var(--accent);
    font-weight: 700;
    white-space: nowrap;
  }

  .picks .toggle.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
</style>
