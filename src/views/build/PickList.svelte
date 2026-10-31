<!--
  A list to pick one entry from (a class, a subclass): each entry with a line about it and its source.
  Long lists (add-on scripts can add hundreds) get a search field.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { PickOption } from './pick.ts';

  interface Props {
    title: string;
    options: PickOption[];
    current: string;
    onpick: (value: string) => void;
    onclose: () => void;
    t: Texts;
  }

  let { title, options, current, onpick, onclose, t }: Props = $props();
  /** From this many entries a search field helps more than it costs. */
  const SEARCH_FROM = 9;
  let query = $state('');
  const shownOptions = $derived(
    options.filter((o) => `${o.label} ${o.line ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
</script>

<Modal {title} onescape={onclose} closeLabel={t.close} wide>
  {#if options.length >= SEARCH_FROM}
    <input class="search" type="search" bind:value={query} placeholder={t.buildSearch} aria-label={t.buildSearch} />
  {/if}
  <ul>
    {#each shownOptions as option (option.value)}
      <li>
        <button
          type="button"
          class:on={option.value === current}
          aria-pressed={option.value === current}
          onclick={() => onpick(option.value)}
        >
          <span class="text">
            <b>{option.label}</b>
            {#if option.line}<small>{option.line}</small>{/if}
          </span>
          {#if option.source}<span class="source">{option.source}</span>{/if}
        </button>
      </li>
    {:else}
      <li class="none">{t.buildNothingFound}</li>
    {/each}
  </ul>
</Modal>

<style>
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

  button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 56px;
    padding: 0.375rem 0.75rem;
    border-radius: 0.625rem;
    text-align: left;
  }

  button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  b {
    font-weight: 700;
  }

  small,
  .source,
  .none {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .source {
    flex: none;
  }
</style>
