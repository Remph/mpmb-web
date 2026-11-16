<!--
  The roll card (M14, mock B, Nick 2026-11-15): a tap on a to-hit, save, skill or initiative rolls at once and
  this card shows it at the bottom of the play view, above a phone's tab bar, so the sheet stays in view. An
  attack's damage is its main button (doubled dice after a natural 20); "again with advantage or disadvantage"
  rolls the same thing once more that way; Mark opens the advantage pop-up the tap used to open.
  Not a window: the page stays usable, and the next tap replaces the roll. The play view reads each roll out
  (its live region stays while the card comes and goes).
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { natural } from '../../dice/dice.ts';
  import type { RollMode } from '../../dice/dice.ts';
  import { TOP_SLOT, damageText, dice, isCritical, titleOf, totalOf } from '../../play/dice.svelte.ts';
  import Stepper from './Stepper.svelte';
  import type { Shown } from '../../play/dice.svelte.ts';

  interface Props {
    shown: Shown;
    /** A phone's tab bar is under the card (the character's play view; companion pages have none yet). */
    onTabBar?: boolean;
    t: Texts;
  }

  let { shown, onTabBar = true, t }: Props = $props();

  const MODE_WORD: Record<RollMode, 'advantage' | 'disadvantage' | 'doubleAdvantage' | 'doubleDisadvantage' | ''> = {
    normal: '',
    advantage: 'advantage',
    disadvantage: 'disadvantage',
    doubleAdvantage: 'doubleAdvantage',
    doubleDisadvantage: 'doubleDisadvantage',
  };

  const title = $derived(titleOf(shown, t));
  const total = $derived(totalOf(shown));
  /** "+ 8", "- 1", or nothing for a bonus of 0. */
  const signed = (n: number): string => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);
  const bonus = $derived(shown.kind === 'd20' ? shown.ask.bonus : shown.roll.formula.bonus);
  /** "d20 + 8 · with advantage" under the dice. */
  const line = $derived.by(() => {
    if (shown.kind === 'damage') {
      const formula = damageText(shown.ask, shown.crit, shown.slot);
      return shown.slot === null ? formula : fill(t.diceSlotLine, { formula, level: shown.slot });
    }
    const word = MODE_WORD[shown.roll.mode];
    const formula = shown.ask.bonus ? `d20 ${signed(shown.ask.bonus)}` : 'd20';
    return word ? `${formula} · ${fill(t.diceWith, { mode: t[word] })}` : formula;
  });
  const nat = $derived(shown.kind === 'd20' ? natural(shown.roll) : null);
  const crit = $derived(isCritical(shown));
  const damage = $derived(shown.kind === 'd20' ? shown.ask.damage : undefined);
  /**
   * A spell whose damage grows with the slot (M17): the card steps the slot level, from the spell's own up to 9.
   * The next damage roll uses it; a roll already on the card stays as it was rolled.
   */
  const upcast = $derived(shown.kind === 'damage' ? shown.ask.upcast : shown.ask.damage?.upcast);
  const slot = $derived(dice.slot ?? upcast?.level ?? 0);
  /** A damage card whose slot was stepped: its main button rolls the new damage, not the old one again. */
  const restepped = $derived(shown.kind === 'damage' && shown.slot !== null && shown.slot !== dice.slot);

  function again(mode?: RollMode) {
    if (shown.kind === 'd20') dice.d20(shown.ask, { mode });
    else dice.damage(shown.ask, { crit: shown.crit });
  }

  let card: HTMLElement | undefined = $state();

  /**
   * Closes the card. If the focus was in it (✕, or Escape after "Again"), it goes back to the number the roll came
   * from: the card's buttons are gone, and a lost focus falls to the top of the page.
   */
  function close() {
    const from = dice.from;
    const inside = !!card?.contains(document.activeElement);
    dice.close();
    if (inside) from?.focus();
  }

  /** Escape closes the card, unless a window is open (its own Escape comes first). */
  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) close();
  }

  // Mock B outlines the number the card's roll came from (app.css `[data-rolled]`), so the eye finds it again.
  // An attribute on another component's element: that component doesn't own it, so this one puts it back.
  $effect(() => {
    const from = dice.from;
    if (!from) return;
    from.dataset.rolled = '';
    return () => delete from.dataset.rolled;
  });
</script>

<svelte:window {onkeydown} />

<section class="card" class:bar={onTabBar} aria-label={t.diceCard} bind:this={card}>
  <div class="head">
    <h2>{title}</h2>
    {#if shown.kind === 'd20' && shown.ask.mark}
      <button
        type="button"
        class="link"
        aria-haspopup="dialog"
        aria-label={fill(t.diceMarkLabel, { title })}
        onclick={shown.ask.mark}>{t.diceMark}</button
      >
    {/if}
    <button type="button" class="x" aria-label={t.close} onclick={close}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
        ><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg
      >
    </button>
  </div>

  {#key dice.count}
    <div class="result">
      <span class="total">{total}</span>
      <span class="what">
        <span class="dice">
          {#if shown.kind === 'd20'}
            {#each shown.roll.rolls as die, i (i)}
              {@const kept = i === shown.roll.keptIndex}
              <span
                class="die"
                class:drop={!kept}
                class:nat20={kept && nat === 'nat20'}
                class:nat1={kept && nat === 'nat1'}
                >{die}{#if !kept}<span class="sr"> ({t.diceDropped})</span>{/if}</span
              >
            {/each}
          {:else}
            {#each shown.roll.rolls as group, g (g)}
              {#if group.group.sign < 0}<span aria-hidden="true">−</span>{:else if g > 0}<span aria-hidden="true"
                  >+</span
                >{/if}
              {#each group.dice as die, i (i)}<span class="die">{die}</span>{/each}
            {/each}
          {/if}
          {#if bonus}<span>{signed(bonus)}</span>{/if}
        </span>
        <span class="line"
          >{line}{#if nat}
            · <b class={nat}>{nat === 'nat20' ? t.diceNat20 : t.diceNat1}</b>{/if}</span
        >
      </span>
    </div>
  {/key}

  <div class="acts">
    {#if damage}
      <button type="button" class="main" onclick={() => dice.damage(damage, { crit })}
        >{fill(crit ? t.diceCritDamage : t.diceDamage, { formula: damageText(damage, crit, dice.slot) })}</button
      >
    {/if}
    {#if shown.kind === 'd20'}
      {#if !damage}
        <button type="button" aria-label={t.diceAgainLabel} onclick={() => again()}>{t.diceAgain}</button>
      {/if}
      <!-- One pair: in German they share the row under the damage button rather than split over two rows. -->
      <span class="again">
        <button type="button" aria-label={t.diceAgainAdvLabel} onclick={() => again('advantage')}
          >{t.diceAgainAdv}</button
        >
        <button type="button" aria-label={t.diceAgainDisLabel} onclick={() => again('disadvantage')}
          >{t.diceAgainDis}</button
        >
      </span>
    {:else if restepped}
      <button type="button" class="main" onclick={() => again()}
        >{fill(shown.crit ? t.diceCritDamage : t.diceDamage, {
          formula: damageText(shown.ask, shown.crit, dice.slot),
        })}</button
      >
    {:else}
      <button type="button" aria-label={t.diceAgainLabel} onclick={() => again()}>{t.diceAgain}</button>
    {/if}
  </div>
  {#if upcast}
    <div class="slot">
      <span>{t.diceSlot}</span>
      <Stepper
        text={String(slot)}
        name={t.diceSlot}
        canLess={slot > upcast.level}
        canMore={slot < TOP_SLOT}
        onless={() => dice.setSlot(slot - 1)}
        onmore={() => dice.setSlot(slot + 1)}
        {t}
      />
    </div>
  {/if}
</section>

<style>
  /* Floats at the bottom middle on a laptop or iPad; on a phone it sits on top of the tab bar. */
  .card {
    position: fixed;
    z-index: 40;
    left: 50%;
    bottom: calc(1.5rem + env(safe-area-inset-bottom));
    width: min(28rem, calc(100% - 1.5rem));
    transform: translateX(-50%);
    padding: 0.375rem 0.375rem 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.875rem;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 0.75rem 2.5rem rgb(0 0 0 / 0.28);
  }

  @media (max-width: 699px) {
    .card.bar {
      bottom: calc(var(--tab-bar-height) + 0.5rem + env(safe-area-inset-bottom));
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  .link {
    min-height: 44px;
    padding: 0 0.5rem;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 700;
  }

  .x {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    background: none;
    color: var(--ink-muted);
  }

  .x:hover,
  .x:focus-visible,
  .link:hover {
    background: var(--hover);
  }

  .result {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0 0.625rem 0.625rem 0;
  }

  .total {
    min-width: 2ch;
    font-family: var(--font-display, var(--font));
    font-size: 3.25rem;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .what {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .dice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    color: var(--ink-muted);
  }

  .die {
    display: inline-grid;
    place-items: center;
    min-width: 2.25rem;
    height: 2.25rem;
    padding: 0 0.375rem;
    border: 1.5px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  /* The die that doesn't count (advantage keeps the other): struck and dashed, not dimmed (contrast stays). */
  .die.drop {
    border-style: dashed;
    color: var(--ink-muted);
    font-weight: 600;
    text-decoration: line-through;
  }

  .die.nat20,
  b.nat20 {
    border-color: var(--ok);
    color: var(--ok);
  }

  .die.nat1,
  b.nat1 {
    border-color: var(--danger);
    color: var(--danger);
  }

  .line {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-right: 0.625rem;
  }

  .acts button {
    flex: 1 1 auto;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--surface);
    color: var(--accent);
    font: inherit;
    font-weight: 700;
  }

  .slot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0.5rem 0.625rem 0 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .again {
    display: flex;
    flex: 1 1 auto;
    gap: 0.5rem;
  }

  /* German "Kritischer Schaden 2d10+4" takes the row; the two "again" buttons share the next one. */
  .acts .main {
    flex: 1 1 10rem;
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
