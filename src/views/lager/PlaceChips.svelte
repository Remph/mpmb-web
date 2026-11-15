<!--
  Where an item is (M16): one chip each for the Lager, the characters items are with already (most used first) and
  gone, and a box for someone new. The add window, the item window and the place window share it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Texts } from '../../i18n.ts';
  import { IN_LAGER, placeKind, placesUsed, type Lager } from '../../lager/lager.ts';

  interface Props {
    value: string;
    lager: Lager;
    disabled?: boolean;
    /** After a tap on a chip (the place window takes it at once). */
    onpicked?: (place: string) => void;
    t: Texts;
  }

  let { value = $bindable(), lager, disabled = false, onpicked, t }: Props = $props();

  const characters = $derived(placesUsed(lager));
  const kind = $derived(placeKind(value));
  /** What the box holds: at first a character not among the chips, then what the player types (a chip empties it). */
  let typed = $state(
    untrack(() => (placeKind(value) === 'character' && !placesUsed(lager).includes(value.trim()) ? value : '')),
  );

  function pick(place: string): void {
    typed = '';
    value = place;
    onpicked?.(place);
  }

  function type(text: string): void {
    typed = text;
    value = text.trim() ? text : IN_LAGER;
  }
</script>

<div class="chips" role="group" aria-label={t.lagerPlace}>
  <button type="button" class="lager" aria-pressed={kind === 'lager'} {disabled} onclick={() => pick(IN_LAGER)}
    >{t.lagerPlaceLager}</button
  >
  {#each characters as name (name)}
    <button
      type="button"
      aria-pressed={kind === 'character' && value.trim() === name}
      {disabled}
      onclick={() => pick(name)}>{name}</button
    >
  {/each}
  <button
    type="button"
    class="gone"
    aria-pressed={kind === 'gone'}
    {disabled}
    onclick={() => pick(kind === 'gone' ? value : t.lagerPlaceGone)}>{t.lagerPlaceGone}</button
  >
</div>
<label class="other">
  <span>{t.lagerPlaceOtherName}</span>
  <input
    type="text"
    value={typed}
    placeholder={t.lagerPlaceOther}
    maxlength={80}
    {disabled}
    oninput={(event) => type(event.currentTarget.value)}
  />
</label>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chips button {
    max-width: 100%;
    padding: 0 0.875rem;
    border-radius: 999px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chips button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .chips .gone[aria-pressed='true'] {
    border-color: var(--ink-muted);
    background: var(--paper);
    color: var(--ink-muted);
  }

  .other {
    display: grid;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .other span {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  input {
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
</style>
