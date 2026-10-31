<!-- Magic items, gear with amounts to count down (potions, arrows), coins and the carried weight. -->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { goldTotal, readInventory } from '../../play/read.ts';
  import type { GearItem, GearList } from '../../play/read.ts';
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

  const COIN_NAMES = {
    pp: ['coinPp', 'coinPpShort'],
    gp: ['coinGp', 'coinGpShort'],
    ep: ['coinEp', 'coinEpShort'],
    sp: ['coinSp', 'coinSpShort'],
    cp: ['coinCp', 'coinCpShort'],
  } as const;
  const total = $derived(goldTotal(inventory.coins));
  const number = $derived(new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 }));

  /** Page 2's and page 3's lists; page 3 only when the sheet has its fields. */
  const LISTS = [
    ['gear', 'gearList'],
    ['extra', 'extraList'],
  ] as const;
  let list = $state<GearList>('gear');
  const hasExtra = $derived(fields['Extra.Gear Row 1'] !== undefined);
  /** The chosen list, grouped by where things are carried (MPMB's location column), in the sheet's order. */
  const groups = $derived(
    inventory.gear
      .filter((item) => item.list === list)
      .reduce<{ location: string; items: GearItem[] }[]>((all, item) => {
        const group = all.filter((g) => g.location === item.location)[0];
        if (group) group.items.push(item);
        else all.push({ location: item.location, items: [item] });
        return all;
      }, [])
      // Things carried nowhere in particular first: under no heading after "Backpack" they'd seem in it.
      .sort((a, b) => Number(a.location !== '') - Number(b.location !== '')),
  );
  const free = $derived(inventory.freeRow[list]);

  /** A name is one line on the sheet; a pasted line break becomes a space. */
  function rename(field: string, event: Event) {
    const name = (event.currentTarget as HTMLTextAreaElement).value.split('\n').join(' ').trim();
    change([{ edit: field, text: name }]);
  }

  /**
   * Enter saves the name, as in a one-line field, instead of starting a new line. Not while an input
   * method is still composing a word: there Enter confirms the word and the name stays open.
   */
  function enterSaves(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    (event.currentTarget as HTMLTextAreaElement).blur();
  }

  /**
   * Long names wrap onto more lines instead of being cut off (the owner asked, 2026-10-31), so the
   * name is a text area as tall as its text. CSS `field-sizing: content` would do this, but Firefox,
   * the group's browser, doesn't have it yet. Runs again when the name or the column's width changes.
   */
  function fitHeight(node: HTMLTextAreaElement, _name: string) {
    const fit = () => {
      node.style.height = 'auto';
      // scrollHeight leaves out the borders; the box is border-box.
      node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
    };
    const resized = new ResizeObserver(fit);
    resized.observe(node);
    node.addEventListener('input', fit);
    return {
      update: fit,
      destroy: () => {
        resized.disconnect();
        node.removeEventListener('input', fit);
      },
    };
  }

  /** A name typed into the empty row goes into the list's first free row, one of it. */
  function add(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.value.trim();
    const prefix = list === 'gear' ? 'Adventuring Gear' : 'Extra.Gear';
    if (name && free !== null) {
      change([
        { edit: `${prefix} Row ${free}`, text: name },
        { edit: `${prefix} Amount ${free}`, text: '1' },
      ]);
    }
    input.value = '';
  }

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
    {#if hasExtra}
      <div class="lists" role="group" aria-label={t.gear}>
        {#each LISTS as [key, label] (key)}
          <button type="button" aria-pressed={list === key} onclick={() => (list = key)}
            >{t[label]} <span class="count">{inventory.gear.filter((item) => item.list === key).length}</span></button
          >
        {/each}
      </div>
    {/if}
    {#each groups as group (group.location)}
      {#if group.location}<h3>{group.location}</h3>{/if}
      <ul>
        {#each group.items as item (item.nameField)}
          <li class="row item">
            <textarea
              class="name"
              rows="1"
              value={item.name}
              aria-label={t.itemName}
              {disabled}
              use:fitHeight={item.name}
              onkeydown={enterSaves}
              onchange={(event) => rename(item.nameField, event)}></textarea>
            <span class="controls">
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
              <!-- MPMB weighs one of a thing; the sheet multiplies it by the amount. -->
              <span class="weight"
                >{item.weight && item.amount !== null ? fill(t.weightEach, { weight: item.weight }) : item.weight}</span
              >
              <button
                type="button"
                class="more"
                aria-label={fill(t.itemMenu, { name: item.name })}
                {disabled}
                onclick={() => change([{ click: item.button }])}>···</button
              >
            </span>
          </li>
        {/each}
      </ul>
    {/each}
    {#if free !== null}
      <!-- The list's first empty row: typing a name there adds an item; its ··· has MPMB's lists. -->
      <div class="row new">
        <input
          class="name"
          type="text"
          placeholder={t.addItem}
          aria-label={t.addItem}
          {disabled}
          onchange={(event) => add(event)}
        />
        <button
          type="button"
          class="more"
          aria-label={t.addFromLists}
          {disabled}
          onclick={() => change([{ click: `${list === 'gear' ? 'Adventuring Gear' : 'Extra.Gear'} Button ${free}` }])}
          >···</button
        >
      </div>
    {/if}
    {#if list === 'gear'}
      <button type="button" class="lists-menu" {disabled} onclick={() => change([{ click: 'Equipment.menu' }])}
        >{t.addPack}</button
      >
    {/if}
  </section>
</div>

<section class="panel" aria-labelledby="coins-title">
  <h2 id="coins-title">{t.coins}</h2>
  <div class="coins">
    {#each inventory.coins as coin (coin.key)}
      <label class="coin {coin.key}">
        <input
          type="text"
          inputmode="numeric"
          value={coin.amount}
          {disabled}
          onchange={(event) => setCoins(coin.field, event)}
        />
        <span><b>{t[COIN_NAMES[coin.key][0]]}</b> {t[COIN_NAMES[coin.key][1]]}</span>
      </label>
    {/each}
  </div>
  {#if inventory.lifestyle || total !== null}
    <div class="purse">
      <span
        >{#if inventory.lifestyle}{fill(inventory.lifestyleCost ? t.lifestyleCost : t.lifestyle, {
            name: inventory.lifestyle,
            cost: inventory.lifestyleCost,
          })}{/if}</span
      >
      {#if total !== null}<span>{fill(t.goldTotal, { total: number.format(total) })}</span>{/if}
    </div>
  {/if}
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

  h3 {
    margin: 0.625rem 0 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* Page 2's and page 3's lists, as two buttons that look like one switch. */
  .lists {
    display: inline-flex;
    margin-bottom: 0.25rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    overflow: hidden;
  }

  .lists button {
    min-height: 44px;
    padding: 0 0.875rem;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--ink-muted);
    font: inherit;
    font-weight: 700;
  }

  .lists button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .count {
    font-weight: 400;
  }

  /* The name looks like text until it is tapped, then it is a field to type in. */
  .name {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.375rem;
    margin-left: -0.375rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--ink);
    font: inherit;
  }

  .name:hover:not(:disabled) {
    border-color: var(--line);
  }

  .name:focus {
    border-color: var(--accent);
    outline: none;
    background: var(--paper);
  }

  .new input.name {
    border: 1px dashed var(--line);
    margin-left: 0;
  }

  /*
   * A narrow column (an iPad in portrait) can't hold a readable name next to the amount, weight and
   * menu: then the controls move to their own line, on the right.
   */
  .item {
    flex-wrap: wrap;
  }

  /* One line of text is as tall as the 44 px buttons beside it: 0.625rem + 1.375em + 0.625rem. */
  .item .name {
    flex: 1 1 10rem;
    padding-block: 0.625rem;
    line-height: 1.375;
    overflow: hidden;
    resize: none;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .weight {
    flex: 0 0 auto;
    min-width: 5.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
    text-align: right;
  }

  .more {
    flex: 0 0 auto;
    min-width: 44px;
    min-height: 44px;
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--ink-muted);
    font: inherit;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .more:hover:not(:disabled) {
    background: var(--hover);
  }

  .new {
    margin-top: 0.375rem;
  }

  .lists-menu {
    min-height: 44px;
    margin-top: 0.5rem;
    padding: 0 0.875rem;
    border: 1px dashed var(--line);
    border-radius: 0.5rem;
    background: transparent;
    color: var(--accent);
    font: inherit;
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

  /* The coin's metal on its rim and name; the number keeps the ink colour so it reads in both themes. */
  .coin {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.25rem 0.25rem 0.375rem;
    border: 2px solid var(--coin);
    border-radius: 0.625rem;
    background: var(--coin-soft);
    color: var(--coin);
    font-size: 0.8125rem;
    text-align: center;
  }

  .coin span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .pp {
    --coin: var(--pp);
    --coin-soft: var(--pp-soft);
  }

  .gp {
    --coin: var(--gp);
    --coin-soft: var(--gp-soft);
  }

  .ep {
    --coin: var(--ep);
    --coin-soft: var(--ep-soft);
  }

  .sp {
    --coin: var(--sp);
    --coin-soft: var(--sp-soft);
  }

  .cp {
    --coin: var(--cp);
    --coin-soft: var(--cp-soft);
  }

  .coin input {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 800;
    text-align: center;
  }

  .coin input:focus-visible {
    outline: 2px solid var(--coin);
    background: var(--surface);
  }

  .purse {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    margin-top: 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
