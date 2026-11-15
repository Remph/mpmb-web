<!--
  The group's Lager (M16, Nick's picks 2026-11-15): a panel down the right edge, opened from the line at the end of
  the Inventory tab. The gold, a search, the place filter, and the groups: magic items with a place each (tap the
  chip to move one), materials with a count each (− and +). A tap on an item's name opens its text and the rest of
  its fields. "+ Add" is the panel's one main action; each group also takes a quick "Add an item …" line.
  Everyone with a sync code sees and changes the same Lager; it asks for changes every 5 seconds while open.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import Stepper from '../play/Stepper.svelte';
  import type { LagerStore } from '../../lager/lager.svelte.ts';
  import {
    goldText,
    importOps,
    IN_LAGER,
    parseGold,
    placeCounts,
    placeKind,
    sameItem,
    shownGroups,
    type LagerGroup,
    type LagerItem,
    type Op,
    type PlaceFilter,
  } from '../../lager/lager.ts';
  import { changedWhen } from './when.ts';
  import LagerAddWindow from './LagerAddWindow.svelte';
  import LagerItemWindow from './LagerItemWindow.svelte';
  import LagerPlaceWindow from './LagerPlaceWindow.svelte';
  import LagerGroupWindow from './LagerGroupWindow.svelte';

  interface Props {
    store: LagerStore;
    onclose: () => void;
    t: Texts;
  }

  let { store, onclose, t }: Props = $props();

  // Fresh numbers while the panel is open.
  $effect(() => store.watch());

  let query = $state('');
  let filter = $state<PlaceFilter>('all');
  let adding = $state<{ group: string | null } | null>(null);
  /** Windows by id, so a change from another device shows in an open window too. */
  let itemOpen = $state<string | null>(null);
  let placeOf = $state<string | null>(null);
  let groupOpen = $state<string | null>(null);
  let importBad = $state(false);
  let importInput: HTMLInputElement | undefined = $state();

  const lager = $derived(store.lager);
  /** Changes only with an answer from the service; offline the panel shows the last copy, read only. */
  const readonly = $derived(store.status !== 'ready');
  const groups = $derived(lager ? shownGroups(lager, query, filter) : []);
  const counts = $derived(lager ? placeCounts(lager) : null);
  const hasPlaces = $derived(Boolean(lager?.groups.some((group) => group.kind === 'place')));
  const found = $derived(groups.some((entry) => entry.items.length));
  const FILTERS = [
    ['all', 'lagerFilterAll'],
    ['lager', 'lagerFilterLager'],
    ['character', 'lagerFilterCharacter'],
    ['gone', 'lagerFilterGone'],
  ] as const;

  const byId = (id: string | null): LagerItem | null => lager?.items.find((item) => item.id === id) ?? null;
  const groupById = (id: string | null): LagerGroup | null => lager?.groups.find((group) => group.id === id) ?? null;

  function send(ops: Op[]): void {
    void store.change(ops);
  }

  /** The gold box: the difference to what it showed, so a change by someone else meanwhile isn't undone. */
  function goldChanged(input: HTMLInputElement): void {
    if (!lager) return;
    const copper = parseGold(input.value);
    if (copper === null) {
      input.value = goldText(lager.copper, t.locale);
      return;
    }
    if (copper !== lager.copper) send([{ op: 'gold', by: copper - lager.copper }]);
  }

  /** "Add an item …" under a group: a name already there counts up (materials) instead of a second row. */
  function quickAdd(input: HTMLInputElement, group: LagerGroup): void {
    const name = input.value.trim();
    input.value = '';
    if (!lager || !name) return;
    const same = group.kind === 'count' ? sameItem(lager, group.id, name) : null;
    if (same) send([{ op: 'count', id: same.id, by: 1 }]);
    else {
      const place = group.kind === 'place' ? IN_LAGER : '';
      send([{ op: 'add', id: crypto.randomUUID(), group: group.id, name, count: 1, place, note: '' }]);
    }
  }

  async function importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let ops: Op[] | null = null;
    try {
      ops = importOps(JSON.parse(await file.text()), () => crypto.randomUUID());
    } catch {
      ops = null;
    }
    importBad = ops === null;
    if (ops) void store.importList(ops);
  }

  /** The note's first line under the name, so an item with a text shows that it has one. */
  const firstLine = (note: string) => note.split('\n')[0] ?? '';
</script>

<Modal title={t.lagerTitle} onescape={onclose} closeLabel={t.close} side>
  {#if lager?.updated}
    <p class="muted">
      {fill(t.lagerChanged, { who: lager.by || '?', when: changedWhen(lager.updated, Date.now(), t) })}
    </p>
  {/if}
  <div class="status" role="status">
    {#if store.status === 'loading' && !lager}<p>{t.lagerLoading}</p>{/if}
    {#if store.status === 'offline'}<p class="note">{t.lagerOffline}</p>{/if}
    {#if store.status === 'error'}<p class="note">{t.lagerError}</p>{/if}
    {#if store.failed && store.status === 'ready'}<p class="note">{t.lagerFailed}</p>{/if}
  </div>

  {#if lager}
    <div class="gold">
      <label class="coin">
        <input
          type="text"
          inputmode="decimal"
          value={goldText(lager.copper, t.locale)}
          disabled={readonly}
          onchange={(event) => goldChanged(event.currentTarget)}
        />
        <span>{t.lagerGold}</span>
      </label>
      <label class="gold-note">
        <span class="sr-only">{t.lagerGoldNote}</span>
        <input
          type="text"
          placeholder={t.lagerGoldNote}
          value={lager.goldNote}
          maxlength={200}
          disabled={readonly}
          onchange={(event) => send([{ op: 'goldNote', note: event.currentTarget.value }])}
        />
      </label>
    </div>

    {#if lager.groups.length}
      <input class="search" type="search" placeholder={t.lagerSearch} aria-label={t.lagerSearch} bind:value={query} />
      {#if hasPlaces && counts}
        <div class="filter" role="group" aria-label={t.lagerShow}>
          {#each FILTERS as [key, label] (key)}
            <button type="button" aria-pressed={filter === key} onclick={() => (filter = key)}
              >{t[label]} <span class="count">{counts[key]}</span></button
            >
          {/each}
        </div>
      {/if}
      {#if (query || filter !== 'all') && !found}<p class="muted">{t.lagerNothing}</p>{/if}

      {#each groups as { group, items, total } (group.id)}
        {#if items.length || (!query && filter === 'all') || (group.kind === 'count' && !query)}
          <section class="group" aria-label={group.name}>
            <div class="group-head">
              <h3>{group.name} <small>{total}</small></h3>
              <button
                type="button"
                class="more"
                aria-label={fill(t.lagerGroupOptions, { name: group.name })}
                disabled={readonly}
                onclick={() => (groupOpen = group.id)}>···</button
              >
            </div>
            <ul>
              {#each items as item (item.id)}
                <li class="row">
                  <button type="button" class="name" onclick={() => (itemOpen = item.id)}
                    ><span>{item.name}</span>{#if item.note}<small>{firstLine(item.note)}</small>{/if}</button
                  >
                  {#if group.kind === 'place'}
                    {#if item.count !== 1}<span class="times">{item.count}×</span>{/if}
                    <button
                      type="button"
                      class="place {placeKind(item.place)}"
                      aria-label={fill(t.lagerPlaceOf, { name: item.name })}
                      disabled={readonly}
                      onclick={() => (placeOf = item.id)}>{item.place || IN_LAGER}</button
                    >
                  {:else}
                    <Stepper
                      text={String(item.count)}
                      name={item.name}
                      canLess={item.count > 0}
                      canMore={true}
                      disabled={readonly}
                      onless={() => send([{ op: 'count', id: item.id, by: -1 }])}
                      onmore={() => send([{ op: 'count', id: item.id, by: 1 }])}
                      {t}
                    />
                  {/if}
                </li>
              {/each}
            </ul>
            {#if !query}
              <input
                class="quick"
                type="text"
                placeholder={t.lagerAddLine}
                aria-label={`${group.name}: ${t.lagerAddLine}`}
                maxlength={200}
                disabled={readonly}
                onchange={(event) => quickAdd(event.currentTarget, group)}
              />
            {/if}
          </section>
        {/if}
      {/each}
    {:else if store.status === 'ready'}
      <p class="empty">{t.lagerEmpty}</p>
      <button type="button" disabled={store.importing} onclick={() => importInput?.click()}>{t.lagerImport}</button>
      <input
        bind:this={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        onchange={(event) => void importFile(event.currentTarget)}
      />
      {#if importBad}<p class="note" role="alert">{t.lagerImportBad}</p>{/if}
    {/if}
  {/if}

  {#snippet actions()}
    <button type="button" class="primary" disabled={readonly || !lager} onclick={() => (adding = { group: null })}
      >{t.lagerAdd}</button
    >
  {/snippet}
</Modal>

{#if adding && lager}
  <LagerAddWindow
    {lager}
    group={adding.group}
    onadd={(ops) => {
      send(ops);
      adding = null;
    }}
    oncancel={() => (adding = null)}
    {t}
  />
{/if}
{#if byId(itemOpen) && lager}
  <LagerItemWindow
    item={byId(itemOpen) as LagerItem}
    {lager}
    {readonly}
    onsave={(ops) => {
      send(ops);
      itemOpen = null;
    }}
    onclose={() => (itemOpen = null)}
    {t}
  />
{/if}
{#if byId(placeOf) && lager}
  <LagerPlaceWindow
    item={byId(placeOf) as LagerItem}
    {lager}
    onpick={(place) => {
      send([{ op: 'set', id: placeOf as string, place }]);
      placeOf = null;
    }}
    onclose={() => (placeOf = null)}
    {t}
  />
{/if}
{#if groupById(groupOpen) && lager}
  <LagerGroupWindow
    group={groupById(groupOpen) as LagerGroup}
    count={lager.items.filter((item) => item.group === groupOpen).length}
    onsave={(ops) => {
      send(ops);
      groupOpen = null;
    }}
    onclose={() => (groupOpen = null)}
    {t}
  />
{/if}

<style>
  .muted {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .status p {
    margin: 0 0 0.5rem;
  }

  .note {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
  }

  /* The gold as the Inventory tab's gold coin, with its note beside it. */
  .gold {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-bottom: 0.75rem;
  }

  .coin {
    display: grid;
    justify-items: center;
    flex: 0 1 12rem;
    padding: 0.375rem 0.5rem;
    border: 2px solid var(--gp);
    border-radius: 0.625rem;
    background: var(--gp-soft);
  }

  .coin input {
    width: 100%;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.375rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .coin span {
    color: var(--gp);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .gold-note {
    flex: 1 1 10rem;
  }

  input[type='text'],
  input[type='search'] {
    width: 100%;
    min-height: 44px;
    padding: 0 0.625rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
  }

  .coin input[type='text'] {
    border: 0;
    background: transparent;
    font-size: 1.375rem;
  }

  .quick {
    margin-top: 0.25rem;
    border-style: dashed !important;
  }

  .search {
    margin-bottom: 0.5rem;
  }

  /* Like the Gear panel's two lists: one row of choices, the chosen one lit. */
  .filter {
    display: flex;
    margin-bottom: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    overflow: hidden;
  }

  .filter button {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.25rem 0.375rem;
    border: 0;
    border-radius: 0;
    line-height: 1.2;
    hyphens: auto;
    overflow-wrap: anywhere;
  }

  .filter button + button {
    border-left: 1px solid var(--line);
  }

  .filter button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .count {
    font-size: 0.8125rem;
  }

  @media (max-width: 499px) {
    .filter .count {
      display: block;
    }
  }

  .group {
    margin-top: 1rem;
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
  }

  h3 small {
    color: var(--ink-muted);
    font-weight: 400;
    font-size: 0.875rem;
  }

  .more {
    border-color: transparent;
    background: none;
    color: var(--ink-muted);
    font-weight: 700;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 52px;
    padding: 0.25rem 0;
    border-top: 1px solid var(--line);
  }

  .row:first-child {
    border-top: 0;
  }

  /* The name opens the item's window: its text, and the rest of its fields. */
  .name {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.25rem 0.5rem;
    border-color: transparent;
    background: none;
    text-align: left;
    font-weight: 700;
  }

  /* One long word (German materials: "Feuersalamanderschuppen") breaks instead of pushing the row wider. */
  .name span {
    hyphens: auto;
    overflow-wrap: anywhere;
  }

  .name small {
    overflow: hidden;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 400;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .times {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }

  /* Where an item is: the accent in the Lager, plain with a character, muted when gone. */
  .place {
    flex: none;
    max-width: 11rem;
    padding: 0 0.875rem;
    border-radius: 999px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .place.lager {
    border-color: var(--accent);
    color: var(--accent);
  }

  .place.gone {
    color: var(--ink-muted);
    text-decoration: line-through;
  }

  .empty {
    margin: 0.5rem 0 0.75rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
