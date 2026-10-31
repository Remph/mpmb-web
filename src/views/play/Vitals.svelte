<!--
  The left column: hit points (the one bold place), the numbers checked every round, conditions and
  the two check boxes players tick during a fight. It stays on screen while the middle scrolls.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { CONDITIONS, readConditions, readHitPoints, readNumbers, readToggles } from '../../play/read.ts';
  import type { Condition } from '../../play/read.ts';
  import { applyDamage, applyHealing, tickedDeathSaves } from '../../play/rules.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Modal from '../../popups/Modal.svelte';
  import NumberPad from './NumberPad.svelte';
  import Stepper from './Stepper.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const hp = $derived(readHitPoints(fields));
  const numbers = $derived(readNumbers(fields));
  const conditions = $derived(readConditions(fields));
  const toggles = $derived(readToggles(fields));
  const current = $derived(hp.current ?? hp.max ?? 0);
  const temp = $derived(hp.temp ?? 0);
  /** The bar shows hit points of the maximum; temporary ones get their own blue end. */
  const percent = (n: number): string => `${hp.max ? Math.min(100, (n / hp.max) * 100) : 0}%`;
  const dying = $derived(current === 0 || hp.deathSaves.successes > 0 || hp.deathSaves.failures > 0);

  let pad: 'damage' | 'heal' | 'temp' | null = $state(null);
  let picking = $state(false);

  /** An empty field stays empty when the result is full health, like a fresh MPMB sheet. */
  const hpText = (n: number): string => (n === hp.max ? '' : String(n));
  const tempText = (n: number): string => (n > 0 ? String(n) : '');

  function applyPad(amount: number) {
    const kind = pad;
    pad = null;
    if (kind === 'temp') return change([{ edit: 'HP Temp', text: tempText(amount) }]);
    const next = kind === 'damage' ? applyDamage(hp, amount) : applyHealing(hp, amount);
    const steps: Step[] = [];
    if (next.current !== current) steps.push({ edit: 'HP Current', text: hpText(next.current) });
    if (next.temp !== temp) steps.push({ edit: 'HP Temp', text: tempText(next.temp) });
    // Back above 0 hit points: the death saves start over.
    if (current === 0 && next.current > 0) steps.push(...tickedDeathSaves(fields).map((click) => ({ click })));
    change(steps);
  }

  const conditionName = (c: Condition): string => t[`condition${c}`];
  const tiles = $derived(
    [
      { label: t.acLabel, value: numbers.armorClass },
      { label: t.initiative, value: numbers.initiative },
      { label: t.speed, value: numbers.speed },
      { label: t.proficiency, value: numbers.proficiency },
      ...numbers.spellSaveDcs.map((dc) => ({ label: t.spellSaveDc, value: dc })),
      { label: t.passivePerception, value: numbers.passivePerception },
    ].filter((tile) => tile.value !== ''),
  );
  const exhaustionText = (n: number): string => (n > 0 ? String(n) : '');
</script>

<section class="hp" aria-labelledby="hp-title">
  <div class="head">
    <h2 id="hp-title">{t.hpTitle}</h2>
    {#if temp > 0}<span class="temp">{fill(t.tempHp, { count: temp })}</span>{/if}
  </div>
  <p class="numbers">
    <span class="now">{current}</span>
    {#if hp.max !== null}<span class="max">/ {hp.max}</span>{/if}
  </p>
  <div class="bar" aria-hidden="true">
    <i style:width={percent(current)}></i>
  </div>
  <div class="buttons">
    <button type="button" class="primary" {disabled} onclick={() => (pad = 'damage')}>{t.damage}</button>
    <button type="button" {disabled} onclick={() => (pad = 'heal')}>{t.heal}</button>
    <button type="button" {disabled} onclick={() => (pad = 'temp')}>{t.tempHpButton}</button>
  </div>
  {#if hp.hitDice.length}
    <div class="dice">
      <span class="label">{t.hitDice}</span>
      {#each hp.hitDice as hd (hd.row)}
        <span class="die">
          <span>{hd.die}</span>
          <Stepper
            text={`${hd.total - hd.used}/${hd.total}`}
            name={`${t.hitDice} ${hd.die}`}
            canLess={hd.used < hd.total}
            canMore={hd.used > 0}
            {disabled}
            onless={() => change([{ edit: `HD${hd.row} Used`, text: String(hd.used + 1) }])}
            onmore={() => change([{ edit: `HD${hd.row} Used`, text: hd.used > 1 ? String(hd.used - 1) : '' }])}
            {t}
          />
        </span>
      {/each}
    </div>
  {/if}
  {#if dying}
    <div class="death">
      <span class="label">{t.deathSaves}</span>
      {#each [['Success', t.successes, hp.deathSaves.successes], ['Fail', t.failures, hp.deathSaves.failures]] as const as [kind, label, count] (kind)}
        <span class="saves" role="group" aria-label={label}>
          <span class="muted">{label}</span>
          {#each [1, 2, 3] as n (n)}
            <button
              type="button"
              class="box"
              class:fail={kind === 'Fail'}
              aria-pressed={n <= count}
              aria-label={`${label} ${n}`}
              {disabled}
              onclick={() => change([{ click: `Death Save ${kind}${n}` }])}
            ></button>
          {/each}
        </span>
      {/each}
    </div>
  {/if}
</section>

<div class="tiles">
  {#each tiles as tile, i (i)}
    <div class="tile"><span class="k">{tile.label}</span><span class="v">{tile.value}</span></div>
  {/each}
</div>

<section class="panel" aria-labelledby="conditions-title">
  <div class="head">
    <h2 id="conditions-title">{t.conditions}</h2>
    {#if conditions.exhaustion > 0}<span class="muted">{t.exhaustion} {conditions.exhaustion}</span>{/if}
  </div>
  <div class="chips">
    {#each conditions.active as c (c)}
      <button
        type="button"
        class="chip on"
        aria-label={fill(t.removeCondition, { name: conditionName(c) })}
        {disabled}
        onclick={() => change([{ click: `Condition.${c}` }])}>{conditionName(c)} ✕</button
      >
    {/each}
    <button type="button" class="chip add" {disabled} onclick={() => (picking = true)}>+ {t.addCondition}</button>
  </div>
</section>

<!--
  The browser ticks the box and the click toggles the sheet's field, so both agree. (Cancelling the
  click instead left the box unticked: the browser undid its tick after the sheet's answer had arrived.)
-->
<section class="panel toggles">
  <label class="toggle">
    <input
      type="checkbox"
      checked={toggles.inspiration}
      {disabled}
      onchange={() => change([{ click: 'Inspiration' }])}
    />
    {t.heroicInspiration}
  </label>
  <label class="toggle">
    <input
      type="checkbox"
      checked={toggles.reactionUsed}
      {disabled}
      onchange={() => change([{ click: 'Reaction Used This Round' }])}
    />
    {t.reactionUsed}
  </label>
</section>

{#if pad === 'damage'}
  <NumberPad
    title={t.damageTitle}
    applyLabel={t.damageTitle}
    danger
    onapply={applyPad}
    onclose={() => (pad = null)}
    {t}
  />
{:else if pad === 'heal'}
  <NumberPad title={t.healTitle} applyLabel={t.heal} onapply={applyPad} onclose={() => (pad = null)} {t} />
{:else if pad === 'temp'}
  <NumberPad
    title={t.tempTitle}
    hint={t.tempHint}
    applyLabel={t.apply}
    onapply={applyPad}
    onclose={() => (pad = null)}
    {t}
  />
{/if}

{#if picking}
  <Modal title={t.conditions} onescape={() => (picking = false)} closeLabel={t.close}>
    <div class="chips">
      {#each CONDITIONS as c (c)}
        <button
          type="button"
          class="chip"
          class:on={conditions.active.includes(c)}
          aria-pressed={conditions.active.includes(c)}
          {disabled}
          onclick={() => change([{ click: `Condition.${c}` }])}>{conditionName(c)}</button
        >
      {/each}
    </div>
    <div class="exhaustion">
      <span>{t.exhaustion}</span>
      <Stepper
        text={String(conditions.exhaustion)}
        name={t.exhaustion}
        canLess={conditions.exhaustion > 0}
        canMore={conditions.exhaustion < 6}
        {disabled}
        onless={() => change([{ edit: 'Condition.Exhaustion', text: exhaustionText(conditions.exhaustion - 1) }])}
        onmore={() => change([{ edit: 'Condition.Exhaustion', text: exhaustionText(conditions.exhaustion + 1) }])}
        {t}
      />
    </div>
  </Modal>
{/if}

<style>
  section,
  .tiles {
    margin-bottom: 0.625rem;
  }

  .panel {
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
  .label {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .hp {
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: var(--hp-soft);
  }

  .temp {
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    background: var(--temp-soft);
    color: var(--temp);
    font-weight: 700;
    font-size: 0.9375rem;
  }

  .numbers {
    margin: 0;
    white-space: nowrap;
  }

  .now {
    font-size: 3.5rem;
    font-weight: 800;
    line-height: 0.95;
    letter-spacing: -0.02em;
    color: var(--hp);
  }

  .max {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--ink-muted);
  }

  .bar {
    position: relative;
    height: 0.5rem;
    margin: 0.625rem 0;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--hp) 18%, transparent);
    overflow: hidden;
  }

  .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 0.25rem;
    background: var(--hp);
  }

  /* Each button as wide as its word plus padding, the rest shared out ("Temp HP" is the longest). */
  .buttons {
    display: flex;
    gap: 0.375rem;
  }

  .buttons button {
    flex: 1 1 auto;
    padding: 0 0.625rem;
    white-space: nowrap;
  }

  .buttons .primary {
    flex-grow: 1.5;
  }

  /* Red, also under the pointer: the shared hover rule would turn it purple. */
  .buttons .primary,
  .buttons .primary:not(:disabled):hover {
    border-color: var(--hp);
    background: var(--hp);
    color: var(--on-hp);
  }

  .dice,
  .death {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.75rem;
    margin-top: 0.5rem;
  }

  .label {
    flex-basis: 100%;
  }

  .die {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 700;
  }

  .saves {
    display: inline-flex;
    align-items: center;
  }

  .box {
    width: 44px;
    padding: 0;
    border: 0;
    background: none;
    display: grid;
    place-items: center;
  }

  .box::before {
    content: '';
    width: 1.125rem;
    height: 1.125rem;
    border: 2px solid var(--ok);
    border-radius: 0.25rem;
  }

  .box.fail::before {
    border-color: var(--hp);
  }

  .box[aria-pressed='true']::before {
    background: var(--ok);
  }

  .box.fail[aria-pressed='true']::before {
    background: var(--hp);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(var(--tile-columns, 3), 1fr);
    gap: 0.375rem;
  }

  .tile {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 56px;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
  }

  .k {
    font-size: 0.8125rem;
    line-height: 1.2;
    color: var(--ink-muted);
  }

  .v {
    font-size: 1.375rem;
    font-weight: 800;
    line-height: 1.2;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chip {
    border-radius: 22px;
    font-weight: 500;
  }

  .chip.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .chip.add {
    border-style: dashed;
    color: var(--ink-muted);
  }

  .toggles {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 0.75rem;
    padding-block: 0.125rem;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    font-weight: 500;
    cursor: pointer;
  }

  .toggle input {
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .exhaustion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
    font-weight: 700;
  }
</style>
