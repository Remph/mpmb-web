<!--
  Asks for a number: big keys for the touch laptops and the iPad, and the keyboard works too (type,
  Enter applies). Used for damage, healing and temporary hit points.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';

  interface Props {
    title: string;
    hint?: string;
    /** The apply button's text: "Take damage". */
    applyLabel: string;
    /** Red for damage, accent otherwise. */
    danger?: boolean;
    onapply: (amount: number) => void;
    onclose: () => void;
    t: Texts;
  }

  let { title, hint = '', applyLabel, danger = false, onapply, onclose, t }: Props = $props();
  let digits = $state('');
  const amount = $derived(digits === '' ? 0 : Number(digits));
  const MAX_DIGITS = 4;
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  function press(key: string) {
    if (digits.length < MAX_DIGITS) digits = digits === '0' ? key : digits + key;
  }

  function apply() {
    if (amount > 0 || digits === '0') onapply(amount);
  }

  function keydown(event: KeyboardEvent) {
    if (/^\d$/.test(event.key)) press(event.key);
    else if (event.key === 'Backspace') digits = digits.slice(0, -1);
    else if (event.key === 'Enter') apply();
    else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<Modal {title} onescape={onclose} closeLabel={t.close}>
  {#if hint}<p class="hint">{hint}</p>{/if}
  <output class="display" class:danger aria-label={t.amount}>{digits || '0'}</output>
  <div class="keys">
    {#each KEYS as key (key)}
      <button type="button" onclick={() => press(key)}>{key}</button>
    {/each}
    <span></span>
    <button type="button" onclick={() => press('0')}>0</button>
    <button type="button" aria-label={t.clearDigit} onclick={() => (digits = digits.slice(0, -1))}>⌫</button>
  </div>
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" class:danger disabled={digits === ''} onclick={apply}>{applyLabel}</button>
  {/snippet}
</Modal>

<style>
  .hint {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .display {
    display: block;
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--paper);
    font-size: 2.5rem;
    font-weight: 800;
    text-align: right;
  }

  .display.danger {
    color: var(--hp);
  }

  .keys {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.375rem;
    margin-top: 0.5rem;
  }

  .keys button {
    min-height: 52px;
    font-size: 1.375rem;
    font-weight: 700;
  }

  button.primary.danger,
  button.primary.danger:not(:disabled):hover {
    border-color: var(--hp);
    background: var(--hp);
    color: var(--on-hp);
  }
</style>
