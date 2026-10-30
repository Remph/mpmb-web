<!-- Magic items, gear with amounts to count down (potions, arrows), coins and the carried weight. -->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { readInventory } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Stepper from './Stepper.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();
  const inventory = $derived(readInventory(fields));
  const attuned = $derived(inventory.magicItems.filter((item) => item.attuned).length);

  /** A coin field takes what the player types; MPMB's own scripts check it. */
  function setCoins(field: string, event: Event) {
    change([{ edit: field, text: (event.currentTarget as HTMLInputElement).value.trim() }]);
  }
</script>

<div class="columns">
  <section class="panel" aria-labelledby="magic-title">
    <div class="head">
      <h2 id="magic-title">{t.magicItems}</h2>
      {#if attuned}<span class="muted">{attuned} {t.attuned}</span>{/if}
    </div>
    <ul>
      {#each inventory.magicItems as item (item.row)}
        <li>
          <details>
            <summary
              >{item.name}{#if item.attuned}<span class="tag">{t.attuned}</span>{/if}</summary
            >
            <p>{item.description}</p>
          </details>
        </li>
      {:else}
        <li class="muted">{t.noItems}</li>
      {/each}
    </ul>
  </section>

  <section class="panel" aria-labelledby="gear-title">
    <div class="head">
      <h2 id="gear-title">{t.gear}</h2>
      {#if inventory.carried}<span class="muted"
          >{inventory.capacity
            ? fill(t.carried, { carried: inventory.carried, capacity: inventory.capacity })
            : inventory.carried}</span
        >{/if}
    </div>
    <ul>
      {#each inventory.gear as item (item.amountField)}
        <li class="row">
          <span>{item.name}</span>
          {#if item.amount !== null}
            <Stepper
              text={String(item.amount)}
              name={item.name}
              canLess={item.amount > 0}
              canMore={true}
              {disabled}
              onless={() => change([{ edit: item.amountField, text: String((item.amount ?? 0) - 1) }])}
              onmore={() => change([{ edit: item.amountField, text: String((item.amount ?? 0) + 1) }])}
              {t}
            />
          {/if}
        </li>
      {:else}
        <li class="muted">{t.noItems}</li>
      {/each}
    </ul>
  </section>
</div>

<section class="panel" aria-labelledby="coins-title">
  <h2 id="coins-title">{t.coins}</h2>
  <div class="coins">
    {#each inventory.coins as coin (coin.key)}
      <label>
        <input
          type="text"
          inputmode="numeric"
          value={coin.amount}
          {disabled}
          onchange={(event) => setCoins(coin.field, event)}
        />
        <span>{coin.key}</span>
      </label>
    {/each}
  </div>
</section>

<style>
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(24rem, 1fr));
    gap: 0 0.625rem;
    align-items: start;
  }

  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .muted {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: 0;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 44px;
  }

  summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 44px;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  /* The flex summary loses the browser's triangle; this one says the row opens. */
  summary::before {
    content: '▸';
    color: var(--ink-muted);
    transition: transform 0.15s;
  }

  details[open] summary::before {
    transform: rotate(90deg);
  }

  details p {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .tag {
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 700;
  }

  .coins {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.375rem;
  }

  .coins label {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .coins input {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1.125rem;
    font-weight: 700;
    text-align: center;
  }
</style>
