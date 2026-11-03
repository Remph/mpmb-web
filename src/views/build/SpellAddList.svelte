<!--
  The Spells step's list to add from (M7): the spells MPMB's dialog offers for one source, by level, with a
  search. Next to the chosen spells on wide screens, in a pop-up from "+ Add spells" on narrow ones.
-->
<script lang="ts">
  import { addList, filtersOf } from '../../build/spells.ts';
  import type { AddFilter, SpellDraft } from '../../build/spells.ts';
  import type { SpellInfo, SpellSource } from '../../engine/spells.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';

  interface Props {
    source: SpellSource;
    spells: Record<string, SpellInfo>;
    draft: SpellDraft;
    /** The filter to start with ("2 more cantrips to choose" opens on the cantrips). */
    start: AddFilter | null;
    ontoggle: (part: 'cantrips' | 'spells', key: string) => void;
    oninfo: (spell: SpellInfo) => void;
    line: (spell: SpellInfo) => string;
    t: Texts;
  }

  let { source, spells, draft, start, ontoggle, oninfo, line, t }: Props = $props();

  const filters = $derived(filtersOf(source, spells));
  const key = (f: AddFilter): string => (f.part === 'cantrips' ? 'c' : String(f.level));
  let chosenFilter = $state<string | null>(null);
  /** The source's highest castable level first: that is where a new level's spells come from. */
  const filter = $derived(
    filters.find((f) => key(f) === (chosenFilter ?? (start ? key(start) : null))) ??
      filters.filter((f) => f.part === 'spells' && f.level !== 'higher').at(-1) ??
      filters[0] ?? { part: 'cantrips' as const },
  );
  let query = $state('');
  const entries = $derived(addList(source, filter, query, spells));
  const chosen = (part: 'cantrips' | 'spells', k: string): boolean =>
    (part === 'cantrips' ? draft.cantrips : draft.spells).includes(k);

  const label = (f: AddFilter): string =>
    f.part === 'cantrips' ? t.cantrips : f.level === 'higher' ? t.spellsHigher : String(f.level);
  const longLabel = (f: AddFilter): string =>
    f.part === 'cantrips' || f.level === 'higher' ? label(f) : fill(t.spellsLevelLabel, { count: f.level });
</script>

<div class="add">
  <input class="search" type="search" bind:value={query} placeholder={t.spellsSearch} aria-label={t.spellsSearch} />
  <div class="chips" role="group" aria-label={t.spellsAddTitle}>
    {#each filters as f (key(f))}
      <button
        type="button"
        aria-pressed={!query.trim() && key(f) === key(filter)}
        aria-label={longLabel(f)}
        onclick={() => {
          chosenFilter = key(f);
          query = '';
        }}>{label(f)}</button
      >
    {/each}
  </div>
  <ul>
    {#each entries as entry (entry.key + entry.part)}
      {@const spell = spells[entry.key]}
      {#if spell}
        {@const on = chosen(entry.part, entry.key)}
        <li>
          <button
            type="button"
            class="name"
            aria-label={fill(t.spellsInfoLabel, { name: spell.name })}
            onclick={() => oninfo(spell)}
          >
            <b>{spell.name}</b>
            {#if spell.ritual}<span class="tag">{t.spellRitual}</span>{/if}
            {#if spell.concentration}<span class="tag">{t.spellConcentration}</span>{/if}
            <small>{line(spell)}{spell.description ? ` — ${spell.description}` : ''}</small>
          </button>
          <button
            type="button"
            class="toggle"
            class:on
            aria-pressed={on}
            aria-label={fill(on ? t.spellsAddedLabel : t.spellsAddLabel, { name: spell.name })}
            onclick={() => ontoggle(entry.part, entry.key)}>{on ? t.spellsAdded : t.spellsAdd}</button
          >
        </li>
      {/if}
    {:else}
      <li class="none">{t.buildNothingFound}</li>
    {/each}
  </ul>
</div>

<style>
  .add {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .search {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chips button {
    padding: 0 0.75rem;
  }

  .chips button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
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
    min-height: 56px;
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: 0;
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
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
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

  .toggle {
    flex: none;
    padding: 0 0.75rem;
    color: var(--accent);
    font-weight: 700;
    white-space: nowrap;
  }

  .toggle.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .none {
    color: var(--ink-muted);
  }
</style>
