<!--
  Choosing armour or a weapon on the "Armour & weapons" step: MPMB's own drop-down list (what the
  chosen sources and add-on scripts allow), in groups, each entry with what it does; a search field; a
  magic bonus for weapons; and any other name, which MPMB then looks up as it does when one is typed in
  Acrobat ("Silvered Longsword" counts as a longsword).
-->
<script lang="ts">
  import { MAX_MAGIC } from '../../build/gear.ts';
  import type { GearOption } from '../../build/gear.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';

  interface Props {
    title: string;
    line: string;
    groups: { title: string; options: GearOption[] }[];
    /** The name the field holds now, marked in the list. */
    current: string;
    /** Weapons get a magic bonus before the name ("+1 Longsword"); armour doesn't need one here. */
    magic: boolean;
    placeholder: string;
    ontake: (name: string, bonus: number) => void;
    onclose: () => void;
    t: Texts;
  }

  let { title, line, groups, current, magic, placeholder, ontake, onclose, t }: Props = $props();
  let query = $state('');
  let typed = $state('');
  let bonus = $state(0);
  const BONUSES = Array.from({ length: MAX_MAGIC + 1 }, (_, i) => i);

  const matches = (option: GearOption): boolean =>
    `${option.name} ${option.line}`.toLowerCase().includes(query.trim().toLowerCase());
  const shown = $derived(
    groups.map((g) => ({ ...g, options: g.options.filter(matches) })).filter((g) => g.options.length),
  );
  const isCurrent = (name: string): boolean => name.toLowerCase() === current.trim().toLowerCase();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const name = typed.trim();
    if (name) ontake(name, bonus);
  }
</script>

<Modal {title} onescape={onclose} closeLabel={t.close} wide>
  <p class="line">{line}</p>
  <div class="tools">
    {#if magic}
      <div class="bonus">
        <span class="label" id="bonus-label">{t.gearMagicBonus}</span>
        <div class="seg" role="group" aria-labelledby="bonus-label">
          {#each BONUSES as n (n)}
            <button type="button" aria-pressed={bonus === n} onclick={() => (bonus = n)}>+{n}</button>
          {/each}
        </div>
      </div>
    {/if}
    <input class="search" type="search" bind:value={query} placeholder={t.buildSearch} aria-label={t.buildSearch} />
  </div>
  <div class="groups">
    {#each shown as group (group.title)}
      <section class="group">
        <h3>{group.title}</h3>
        <ul>
          {#each group.options as option (option.name)}
            <li>
              <button
                type="button"
                class:on={isCurrent(option.name)}
                aria-pressed={isCurrent(option.name)}
                onclick={() => ontake(option.name, option.magic ? bonus : 0)}
              >
                <b>{magic && option.magic && bonus ? `+${bonus} ` : ''}{option.name}</b>
                <small
                  >{option.line}{#if option.untrained}{option.line ? ' · ' : ''}<span class="warn"
                      >{t.gearUntrained}</span
                    >{/if}</small
                >
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="line">{t.buildNothingFound}</p>
    {/each}
  </div>
  <h3>{t.gearOtherName}</h3>
  <form class="own" onsubmit={submit}>
    <input type="text" bind:value={typed} aria-label={t.gearOtherName} {placeholder} />
    <button type="submit" class="primary" disabled={!typed.trim()}
      >{fill(t.gearTake, { name: typed.trim() || '…' })}</button
    >
  </form>
</Modal>

<style>
  .line {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
  }

  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
  }

  .bonus {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .seg {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    min-width: 44px;
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
  }

  .search,
  .own input {
    flex: 1 1 14rem;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  /* Two columns of groups where the window is wide enough; a group stays in one column. */
  .groups {
    columns: 2 22rem;
    column-gap: 1rem;
  }

  .group {
    break-inside: avoid;
    margin-bottom: 0.75rem;
  }

  h3 {
    margin: 0.5rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  ul {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li button {
    display: grid;
    width: 100%;
    min-height: 52px;
    padding: 0.375rem 0.75rem;
    border-radius: 0.625rem;
    text-align: left;
    line-height: 1.25;
  }

  li button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  b {
    font-weight: 700;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .warn {
    color: var(--danger);
  }

  .own {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
