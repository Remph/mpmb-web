<!--
  The layout of the species and background steps (M6, as drawn): MPMB's list on one side, what the
  chosen entry brings on the other, with its one main action ("Take Dwarf") at the bottom. A tap in the
  list only shows the entry; nothing changes on the sheet before the main action. Where the step is
  narrow (iPad upright), the details come first and a tap in the list brings them into view.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Texts } from '../../i18n.ts';

  interface Item {
    value: string;
    label: string;
    line: string;
    source: string;
    current: boolean;
  }

  interface Props {
    title: string;
    line: string;
    searchLabel: string;
    items: Item[];
    selected: string;
    onselect: (value: string) => void;
    detail: Snippet;
    t: Texts;
  }

  let { title, line, searchLabel, items, selected, onselect, detail, t }: Props = $props();
  /** From this many entries a search field helps (MPMB's SRD has nine species; add-ons bring more). */
  const SEARCH_FROM = 9;
  let query = $state('');
  let detailCard: HTMLElement | undefined = $state();
  const shownItems = $derived(
    items.filter((i) => `${i.label} ${i.line}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  function select(value: string) {
    onselect(value);
    // Upright on an iPad the details sit above the list: bring them into view.
    if (detailCard && detailCard.getBoundingClientRect().top < 0) {
      detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<section class="card">
  <h2>{title}</h2>
  <p class="line">{line}</p>
  <div class="catalog">
    <div class="list">
      {#if items.length >= SEARCH_FROM}
        <input class="search" type="search" bind:value={query} placeholder={searchLabel} aria-label={searchLabel} />
      {/if}
      <ul>
        {#each shownItems as item (item.value)}
          <li>
            <button
              type="button"
              class="entry"
              class:on={item.value === selected}
              aria-pressed={item.value === selected}
              onclick={() => select(item.value)}
            >
              <span class="text">
                <b
                  >{item.label}{#if item.current}<span class="mark" aria-hidden="true"> ✓</span>{/if}</b
                >
                {#if item.line}<small>{item.line}</small>{/if}
              </span>
              <span class="source">{item.source}</span>
            </button>
          </li>
        {:else}
          <li class="none">{t.buildNothingFound}</li>
        {/each}
      </ul>
    </div>
    <div class="detail" bind:this={detailCard}>
      {@render detail()}
    </div>
  </div>
</section>

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

  .catalog {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 0.75rem;
    align-items: start;
  }

  .search {
    width: 100%;
    min-height: 44px;
    margin-bottom: 0.5rem;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  ul {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .entry {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 56px;
    padding: 0.375rem 0.75rem;
    text-align: left;
  }

  .entry.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.3;
  }

  .text small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .mark {
    color: var(--accent);
  }

  .source {
    flex: none;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .none {
    color: var(--ink-muted);
  }

  .detail {
    position: sticky;
    top: 0.75rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  /* What the steps put into the details (their snippet): the same look for species and backgrounds. */
  .detail :global(h3) {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .detail :global(.meta) {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .detail :global(.lbl) {
    margin: 0.75rem 0 0.25rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .detail :global(.chips) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .detail :global(.chips button) {
    padding: 0 0.75rem;
  }

  .detail :global(.chips button[aria-pressed='true']) {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .detail :global(.traits) {
    margin-top: 0.5rem;
  }

  .detail :global(.note) {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .detail :global(.take),
  .detail :global(.on-sheet) {
    width: 100%;
    margin: 1rem 0 0;
  }

  .detail :global(.on-sheet) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .detail :global(dl) {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.375rem 1rem;
    margin: 0.5rem 0 0;
  }

  .detail :global(dt) {
    color: var(--ink-muted);
    font-weight: 700;
  }

  .detail :global(dd) {
    margin: 0;
  }

  /* Below 1000 px the rail leaves too little room for two columns (iPad upright: about 560 px). */
  @media (max-width: 999px) {
    .catalog {
      grid-template-columns: minmax(0, 1fr);
    }

    .detail {
      position: static;
      order: -1;
    }
  }
</style>
