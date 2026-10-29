<!-- The middle column's first tab: what a turn needs. Attacks, spell slots, limited features, actions. -->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import {
    attacksPerAction,
    isOn,
    readActions,
    readAttacks,
    readLimitedFeatures,
    readSpellSlotUse,
  } from '../../play/read.ts';
  import type { LimitedFeature } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Dots from './Dots.svelte';
  import Stepper from './Stepper.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const attacks = $derived(readAttacks(fields));
  const perAction = $derived(attacksPerAction(fields));
  const slots = $derived(readSpellSlotUse(fields));
  const features = $derived(readLimitedFeatures(fields));
  const actions = $derived(readActions(fields));

  /** MPMB leaves "used" empty rather than 0. */
  const usedText = (used: number): string => (used > 0 ? String(used) : '');
  const setUsed = (feature: LimitedFeature, used: number) =>
    change([{ edit: `Limited Feature Used ${feature.row}`, text: usedText(used) }]);

  /**
   * Leaves the first `used` slot boxes ticked and the rest unticked, clicking only those that differ:
   * boxes ticked out of order in Acrobat end up in the sheet's order.
   */
  function setSlots(boxes: string[], used: number) {
    change(boxes.filter((box, i) => isOn(fields, box) !== i < used).map((click) => ({ click })));
  }

  /** "Attack / Magic / Utilize" reads as a list. */
  const list = (items: string[]): string => items.map((item) => item.replaceAll(' / ', ', ')).join(', ');
  const POOL_STEP = 1;
</script>

<section class="panel" aria-labelledby="attacks-title">
  <div class="head">
    <h2 id="attacks-title">{t.attacks}</h2>
    {#if Number(perAction) > 1}<span class="muted">{fill(t.attacksPerAction, { count: perAction })}</span>{/if}
  </div>
  {#each attacks as attack (attack.row)}
    <div class="attack">
      <span class="name">{attack.name}</span>
      <span class="hit">
        {#if attack.toHit}<span class="badge">{attack.toHit}</span>{/if}
        {#if attack.damage}
          <span class="badge damage">{attack.damage} <small>{attack.damageType}</small></span>
        {/if}
      </span>
      <span class="muted">{[attack.range, attack.description].filter(Boolean).join(', ')}</span>
    </div>
  {:else}
    <p class="muted">{t.noAttacks}</p>
  {/each}
</section>

{#if slots.length}
  <section class="panel" aria-labelledby="slots-title">
    <h2 id="slots-title">{t.spellSlots}</h2>
    {#each slots as level (level.level)}
      <div class="uses">
        <span class="name"
          >{fill(t.slotLevel, { count: level.level })}
          <small>{fill(t.slotsLeft, { left: level.total - level.used, total: level.total })}</small></span
        >
        <Dots
          total={Math.min(level.total, level.boxes.length)}
          used={level.used}
          name={`${t.spellSlots} ${fill(t.slotLevel, { count: level.level })}`}
          {disabled}
          onchange={(used) => setSlots(level.boxes, used)}
          {t}
        />
      </div>
    {/each}
  </section>
{/if}

{#if features.length}
  <section class="panel" aria-labelledby="features-title">
    <div class="head">
      <h2 id="features-title">{t.limitedFeatures}</h2>
      <span class="muted">{t.tapToUse}</span>
    </div>
    {#each features as feature (feature.row)}
      <div class="uses">
        <span class="name">{feature.name} <small>{feature.recovery}</small></span>
        {#if feature.max === null}
          <span class="muted">{feature.maxText}</span>
        {:else if feature.pool}
          <Stepper
            text={fill(t.poolLeft, { left: feature.max - feature.used, total: feature.max })}
            name={feature.name}
            canLess={feature.used < feature.max}
            canMore={feature.used > 0}
            {disabled}
            onless={() => setUsed(feature, feature.used + POOL_STEP)}
            onmore={() => setUsed(feature, feature.used - POOL_STEP)}
            {t}
          />
        {:else}
          <Dots
            total={feature.max}
            used={feature.used}
            name={feature.name}
            {disabled}
            onchange={(used) => setUsed(feature, used)}
            {t}
          />
        {/if}
      </div>
    {/each}
  </section>
{/if}

{#if actions.action.length || actions.bonusAction.length || actions.reaction.length}
  <section class="panel" aria-labelledby="actions-title">
    <h2 id="actions-title">{t.actions}</h2>
    <dl>
      {#if actions.bonusAction.length}<dt>{t.bonusAction}</dt>
        <dd>{list(actions.bonusAction)}</dd>{/if}
      {#if actions.reaction.length}<dt>{t.reaction}</dt>
        <dd>{list(actions.reaction)}</dd>{/if}
      {#if actions.action.length}<dt>{t.action}</dt>
        <dd>{list(actions.action)}</dd>{/if}
    </dl>
  </section>
{/if}

<style>
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

  .muted,
  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 400;
  }

  p {
    margin: 0;
  }

  .attack {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.125rem 0.75rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }

  .attack:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .attack .name {
    font-size: 1.0625rem;
    font-weight: 800;
  }

  .hit {
    grid-row: span 2;
    align-self: center;
    display: flex;
    gap: 0.375rem;
  }

  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 3.5rem;
    min-height: 44px;
    padding: 0 0.5rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1.125rem;
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
  }

  .badge.damage {
    min-width: 6rem;
    background: var(--paper);
    color: var(--ink);
  }

  .badge small {
    display: block;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .uses {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.125rem 0;
    border-top: 1px solid var(--line);
  }

  .uses:first-of-type {
    border-top: 0;
  }

  .uses .name {
    min-width: 0;
    font-weight: 700;
    line-height: 1.2;
  }

  .uses small {
    display: block;
    font-size: 0.8125rem;
  }

  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 0.75rem;
    margin: 0;
    font-size: 0.9375rem;
  }

  dt {
    color: var(--ink-muted);
  }

  dd {
    margin: 0;
  }
</style>
