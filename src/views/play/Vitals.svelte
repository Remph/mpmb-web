<!--
  The left column: hit points (the one bold place), the numbers checked every round, conditions and
  the two check boxes players tick during a fight. It stays on screen while the middle scrolls.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { tick } from 'svelte';
  import { ARROW, edgeOf } from '../../play/edge.ts';
  import type { Edge } from '../../play/edge.ts';
  import { acFromEffects, effectOn, toggle } from '../../play/effects.ts';
  import type { Effect } from '../../play/effects.ts';
  import EffectsWindow from './EffectsWindow.svelte';
  import {
    CONDITIONS,
    readConditions,
    readHitPoints,
    readNumbers,
    readRollMarks,
    readToggles,
  } from '../../play/read.ts';
  import type { Condition } from '../../play/read.ts';
  import { applyDamage, applyHealing, maxNow, tickedDeathSaves } from '../../play/rules.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import Modal from '../../popups/Modal.svelte';
  import NumberPad from './NumberPad.svelte';
  import Stepper from './Stepper.svelte';
  import EdgePopUp from './EdgePopUp.svelte';
  import UltCharges from './UltCharges.svelte';
  import SpeedWindow from './SpeedWindow.svelte';
  import type { UltCharges as Ult } from '../../homebrew/ult.ts';
  import { shownTiles, statColor, statSoft } from '../../play/stat-colors.ts';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    /** The ult charges (homebrew), or null while their switch is off. */
    ult?: Ult | null;
    onult?: (ult: Ult) => void;
    /** The character's effects (src/play/effects.ts) and how to keep a changed list. */
    effects?: Effect[];
    oneffects?: (effects: Effect[]) => void;
    /** Advantage or disadvantage on attack rolls against the character (kept in the app, not the sheet). */
    acEdge?: Edge;
    onacedge?: (edge: Edge) => void;
    t: Texts;
  }

  let {
    fields,
    disabled,
    change,
    ult = null,
    onult = () => {},
    effects = [],
    oneffects = () => {},
    acEdge = '',
    onacedge = () => {},
    t,
  }: Props = $props();

  const hp = $derived(readHitPoints(fields));
  const numbers = $derived(readNumbers(fields));
  const conditions = $derived(readConditions(fields));
  const toggles = $derived(readToggles(fields));
  const top = $derived(maxNow(hp));
  const current = $derived(hp.current ?? top ?? 0);
  const temp = $derived(hp.temp ?? 0);
  /** The bar shows hit points of the whole maximum; a lowered part is hatched at its end. */
  const percent = (n: number): string => `${hp.max ? Math.min(100, (n / hp.max) * 100) : 0}%`;
  const lost = $derived(hp.lowered !== null && hp.max !== null ? hp.max - hp.lowered : 0);
  const dying = $derived(current === 0 || hp.deathSaves.successes > 0 || hp.deathSaves.failures > 0);

  let pad: 'damage' | 'heal' | 'temp' | null = $state(null);
  /** The damage window's switch: this hit lowers the maximum too (Life Drain). Off each time it opens. */
  let lowersMax = $state(false);
  let picking = $state(false);

  /** An empty field stays empty when the result is full health, like a fresh MPMB sheet. */
  const hpText = (n: number): string => (n === hp.max ? '' : String(n));
  const tempText = (n: number): string => (n > 0 ? String(n) : '');

  function applyPad(amount: number) {
    const kind = pad;
    pad = null;
    if (kind === 'temp') return change([{ edit: 'HP Temp', text: tempText(amount) }]);
    const next = kind === 'damage' ? applyDamage(hp, amount, lowersMax) : applyHealing(hp, amount);
    const steps: Step[] = [];
    // MPMB's "current maximum" box; the hit points get written as a number then, as empty means the full maximum.
    if (next.lowered !== hp.lowered) steps.push({ edit: 'HP Max Current', text: String(next.lowered ?? '') });
    if (next.current !== current || (next.lowered !== null && hp.current === null))
      steps.push({ edit: 'HP Current', text: hpText(next.current) });
    if (next.temp !== temp) steps.push({ edit: 'HP Temp', text: tempText(next.temp) });
    // Back above 0 hit points: the death saves start over.
    if (current === 0 && next.current > 0) steps.push(...tickedDeathSaves(fields).map((click) => ({ click })));
    change(steps);
  }

  /** Restore: the maximum is whole again; hit points stay where they are. */
  function restoreMax() {
    const steps: Step[] = [{ edit: 'HP Max Current', text: '' }];
    if (hp.current === null) steps.push({ edit: 'HP Current', text: hpText(current) });
    change(steps);
  }

  const conditionName = (c: Condition): string => t[`condition${c}`];
  /** Initiative's advantage or disadvantage (the PDF's "Init Adv" and "Init Dis" boxes). */
  const initiativeMark = $derived(readRollMarks(fields).initiative);
  const initiativeEdge = $derived(edgeOf(initiativeMark));
  let marking = $state(false);
  /** Tapping Speed opens its window; focus goes back to the tile afterwards, as for initiative. */
  let editingSpeed = $state(false);
  let speedTile: HTMLButtonElement | undefined = $state();
  async function closeSpeed() {
    editingSpeed = false;
    await tick();
    speedTile?.focus();
  }
  let initiativeTile: HTMLButtonElement | undefined = $state();
  /** Focus goes back to the tile once the pop-up is gone (while it is open the page is inert). */
  async function closeMark() {
    marking = false;
    await tick();
    initiativeTile?.focus();
  }
  const tiles = $derived(
    shownTiles([
      { label: t.acLabel, value: numbers.armorClass, kind: 'ac' },
      { label: t.initiative, value: numbers.initiative, kind: 'init', initiative: true },
      { label: t.speed, value: numbers.speed, kind: 'speed' },
      { label: t.proficiency, value: numbers.proficiency, kind: 'prof' },
      ...numbers.spellSaveDcs.map((dc) => ({ label: t.spellSaveDc, value: dc, kind: 'dc' as const })),
      { label: t.passivePerception, value: numbers.passivePerception, kind: 'pp' },
    ]),
  );
  const exhaustionText = (n: number): string => (n > 0 ? String(n) : '');

  // ---- Effects: one tap writes a feature's changes into the sheet, the next takes them out ----
  let editingEffects = $state(false);
  let effectsButton: HTMLButtonElement | undefined = $state();
  async function closeEffects() {
    editingEffects = false;
    await tick();
    effectsButton?.focus();
  }
  /** By id, from the list as it is now (see toggle in effects.ts): quick taps each see the one before. */
  function toggleEffect(id: string) {
    const { steps, effects: next } = toggle(fields, effects, id);
    if (steps.length) change(steps);
    oneffects(next);
  }
  /** "Rage: AC +2, weapon attacks use Str" for the effects that are on. */
  function summary(effect: Effect): string {
    // The AC bonus in the page's language ("+INT+1"), not MPMB's field text ("Int+1").
    const ability = effect.acAbility ? `+${t[`short${effect.acAbility}`]}` : '';
    const n = effect.acNumber;
    const bonus = `${ability}${n > 0 ? `+${n}` : n < 0 ? n : ''}`;
    const parts = [
      bonus ? fill(t.effectAcPart, { bonus }) : '',
      effect.weaponAbility ? fill(t.effectWeaponPart, { ability: t[`short${effect.weaponAbility}`] }) : '',
    ].filter(Boolean);
    return fill(t.effectSummary, { name: effect.name, changes: parts.join(', ') || t.effectNoChanges });
  }
  const effectsOn = $derived(effects.filter(effectOn));

  // ---- The AC tile: how enemies roll against the character ----
  let markingAc = $state(false);
  let acTile: HTMLButtonElement | undefined = $state();
  async function closeAcMark() {
    markingAc = false;
    await tick();
    acTile?.focus();
  }
  const edgeWord = (e: 'adv' | 'dis'): string => (e === 'adv' ? t.advantage : t.disadvantage);
  /** What the effects that are on add to the AC (finding 05): a badge on the tile, named in its label and window. */
  const acEffects = $derived(acFromEffects(fields, effects));
  const acBadge = $derived(
    acEffects.bonus > 0 ? `+${acEffects.bonus}` : acEffects.bonus < 0 ? `−${-acEffects.bonus}` : '',
  );
  /** "18 (+2 from Shield of Faith)": the AC as the label and the window read it out. */
  const acSpoken = (value: string): string =>
    acBadge ? `${value}${fill(t.acFromEffects, { bonus: acBadge, names: acEffects.names.join(', ') })}` : value;
</script>

<section class="hp" aria-labelledby="hp-title">
  <div class="head">
    <h2 id="hp-title">{t.hpTitle}</h2>
    {#if temp > 0}<span class="temp">{fill(t.tempHp, { count: temp })}</span>{/if}
  </div>
  <p class="numbers">
    <span class="now">{current}</span>
    {#if top !== null}<span class="max">/ {top}</span>{/if}
  </p>
  <div class="bar" aria-hidden="true">
    <i style:width={percent(current)}></i>
    {#if lost > 0}<b style:width={percent(lost)}></b>{/if}
  </div>
  {#if lost > 0}
    <div class="lowered">
      <span>{fill(t.hpMaxLowered, { count: lost })} <s>{hp.max}</s></span>
      <button type="button" {disabled} aria-label={fill(t.hpMaxRestoreLabel, { max: hp.max ?? 0 })} onclick={restoreMax}
        >{t.hpMaxRestore}</button
      >
    </div>
  {/if}
  <div class="buttons">
    <button
      type="button"
      class="primary"
      {disabled}
      onclick={() => {
        lowersMax = false;
        pad = 'damage';
      }}>{t.damage}</button
    >
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
    {#if tile.initiative}
      <!-- Tapping initiative marks it with advantage or disadvantage, like a skill. -->
      <button
        type="button"
        class="tile"
        style:--stat={statColor(tile.kind)}
        style:--stat-soft={statSoft(tile.kind)}
        aria-haspopup="dialog"
        aria-label={`${tile.label} ${tile.value}${initiativeEdge ? `, ${initiativeEdge === 'adv' ? t.advantage : t.disadvantage}` : ''}`}
        bind:this={initiativeTile}
        onclick={() => (marking = true)}
        ><span class="k">{tile.label}</span><span class="v"
          >{tile.value}{#if initiativeEdge}<span class="edge {initiativeEdge}" aria-hidden="true"
              >{ARROW[initiativeEdge]}</span
            >{/if}</span
        ></button
      >
    {:else if tile.kind === 'ac'}
      <!-- Tapping AC marks how enemies roll against the character, like initiative's mark. -->
      <button
        type="button"
        class="tile"
        style:--stat={statColor(tile.kind)}
        style:--stat-soft={statSoft(tile.kind)}
        aria-haspopup="dialog"
        aria-label={acEdge
          ? fill(t.acEdgeLabel, { value: acSpoken(tile.value), edge: edgeWord(acEdge) })
          : fill(t.acTileLabel, { value: acSpoken(tile.value) })}
        {disabled}
        bind:this={acTile}
        onclick={() => (markingAc = true)}
        ><span class="k"
          >{tile.label}{#if acEdge}<small class="against {acEdge}"
              >{acEdge === 'adv' ? t.acEdgeShortAdv : t.acEdgeShortDis}</small
            >{/if}</span
        ><span class="v"
          >{tile.value}{#if acBadge}<span class="badge" aria-hidden="true">{acBadge}</span>{/if}{#if acEdge}<span
              class="edge against {acEdge}"
              aria-hidden="true">{ARROW[acEdge]}</span
            >{/if}</span
        ></button
      >
    {:else if tile.kind === 'speed'}
      <button
        type="button"
        class="tile"
        style:--stat={statColor(tile.kind)}
        style:--stat-soft={statSoft(tile.kind)}
        aria-haspopup="dialog"
        aria-label={fill(t.speedEditLabel, { value: tile.value })}
        {disabled}
        bind:this={speedTile}
        onclick={() => (editingSpeed = true)}
        ><span class="k">{tile.label}</span><span class="v">{tile.value}</span></button
      >
    {:else}
      <div class="tile" style:--stat={statColor(tile.kind)} style:--stat-soft={statSoft(tile.kind)}>
        <span class="k">{tile.label}</span><span class="v">{tile.value}</span>
      </div>
    {/if}
  {/each}
</div>

{#if ult}
  <UltCharges {ult} {disabled} onchange={onult} {t} />
{/if}

<!--
  "Right now" (UI review 3, finding 04): what is on at the moment, in one card, since each part is usually
  empty: the effect switches, the conditions, then Heroic Inspiration and the reaction. The summary of an
  effect that is on sits between them, so with nothing on all of it is one row of chips.
-->
<section class="panel" aria-labelledby="now-title">
  <div class="head">
    <h2 id="now-title">{t.rightNow}</h2>
    {#if effects.length}
      <button
        type="button"
        class="change"
        aria-label={t.effectsChangeLabel}
        aria-haspopup="dialog"
        {disabled}
        bind:this={effectsButton}
        onclick={() => (editingEffects = true)}>{t.effectsChange}</button
      >
    {/if}
  </div>
  <div class="chips">
    {#each effects as effect (effect.id)}
      <button
        type="button"
        class="chip switch"
        class:on={effectOn(effect)}
        aria-pressed={effectOn(effect)}
        {disabled}
        onclick={() => toggleEffect(effect.id)}><span class="dot" aria-hidden="true"></span>{effect.name}</button
      >
    {/each}
    {#if !effects.length}
      <button
        type="button"
        class="chip add"
        aria-haspopup="dialog"
        {disabled}
        bind:this={effectsButton}
        onclick={() => (editingEffects = true)}>+ {t.addEffect}</button
      >
    {/if}
    {#each conditions.active as c (c)}
      <button
        type="button"
        class="chip cond"
        aria-label={fill(t.removeCondition, { name: conditionName(c) })}
        {disabled}
        onclick={() => change([{ click: `Condition.${c}` }])}>{conditionName(c)} ✕</button
      >
    {/each}
    {#if conditions.exhaustion > 0}
      <button type="button" class="chip cond" aria-haspopup="dialog" {disabled} onclick={() => (picking = true)}
        >{t.exhaustion} {conditions.exhaustion}</button
      >
    {/if}
    <button
      type="button"
      class="chip add"
      aria-label={t.addCondition}
      aria-haspopup="dialog"
      {disabled}
      onclick={() => (picking = true)}>+ {t.addConditionShort}</button
    >
    {#each effectsOn as effect (effect.id)}
      <p class="effect-on">{summary(effect)}</p>
    {/each}
    <!--
      The browser ticks the box and the click toggles the sheet's field, so both agree. (Cancelling the
      click instead left the box unticked: the browser undid its tick after the sheet's answer had arrived.)
    -->
    <label class="chip tick" class:ticked={toggles.inspiration}>
      <input
        type="checkbox"
        checked={toggles.inspiration}
        {disabled}
        onchange={() => change([{ click: 'Inspiration' }])}
      />
      {t.inspirationShort}
    </label>
    <label class="chip tick" class:ticked={toggles.reactionUsed}>
      <input
        type="checkbox"
        checked={toggles.reactionUsed}
        {disabled}
        onchange={() => change([{ click: 'Reaction Used This Round' }])}
      />
      {t.reactionUsed}
    </label>
  </div>
</section>

{#if marking}
  <EdgePopUp
    title={t.initiative}
    roll={`${t.initiative} ${numbers.initiative}`}
    state={initiativeMark}
    boxes="Init"
    {disabled}
    {change}
    onclose={() => void closeMark()}
    {t}
  />
{/if}

{#if markingAc}
  <EdgePopUp
    title={t.acEdgeTitle}
    roll={`${t.acLabel} ${acSpoken(numbers.armorClass)}`}
    state={{ advantage: acEdge === 'adv', disadvantage: acEdge === 'dis' }}
    boxes=""
    onmark={onacedge}
    note={t.acEdgeNote}
    hint={t.acEdgeHint}
    {disabled}
    {change}
    onclose={() => void closeAcMark()}
    {t}
  />
{/if}

{#if editingEffects}
  <EffectsWindow {effects} {fields} onsave={oneffects} onclose={() => void closeEffects()} {t} />
{/if}

{#if editingSpeed}
  <SpeedWindow {fields} {change} onclose={() => void closeSpeed()} {t} />
{/if}

{#if pad === 'damage'}
  <NumberPad
    title={t.damageTitle}
    applyLabel={t.damageTitle}
    danger
    onapply={applyPad}
    onclose={() => (pad = null)}
    {t}
  >
    <label class="lowers">
      <input type="checkbox" bind:checked={lowersMax} />
      <span>{t.lowersMax}<small>{t.lowersMaxHint}</small></span>
    </label>
  </NumberPad>
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

  /* The part of the maximum an attack took: hatched, so it reads as gone for now, not as damage. */
  .bar b {
    position: absolute;
    inset: 0 0 0 auto;
    border-left: 2px solid var(--surface);
    background: repeating-linear-gradient(
      135deg,
      color-mix(in srgb, var(--ink-muted) 55%, transparent) 0 3px,
      transparent 3px 6px
    );
  }

  .lowered {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: -0.25rem 0 0.5rem;
    color: var(--hp);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .lowered s {
    color: var(--ink-muted);
    font-weight: 500;
  }

  .lowered button {
    padding: 0 0.625rem;
    color: var(--accent);
    font-weight: 600;
  }

  .lowers {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-height: 44px;
    margin-top: 0.5rem;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
  }

  .lowers small {
    display: block;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 400;
  }

  .lowers input {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin: 0;
    accent-color: var(--hp);
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
    /* Each number in its own colour (--stat, set per tile), on a pale wash of it, so the row stands out. */
    border: 1px solid color-mix(in srgb, var(--stat) 35%, transparent);
    border-radius: 0.5rem;
    background: var(--stat-soft);
    color: var(--stat);
  }

  /* Initiative's and Speed's tiles are buttons (they open a pop-up) but look like the others. */
  button.tile {
    align-items: stretch;
    min-height: 56px;
    color: var(--stat);
    font: inherit;
    text-align: left;
  }

  /*
   * Under the pointer the border takes the full colour; the wash stays, because the shared hover rule's grey would
   * hide the colour and a deeper wash drops the advantage arrow below 4.5:1 (hover also sticks after a tap on the iPad).
   */
  button.tile:not(:disabled):hover,
  button.tile:focus-visible {
    border-color: var(--stat);
    background: var(--stat-soft);
    color: var(--stat);
  }

  /* The effects' share of the AC, in the effect switches' own colour so it reads as theirs. */
  .badge {
    display: inline-block;
    margin-left: 0.25rem;
    padding: 0 0.3125rem;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 800;
    line-height: 1.35;
    vertical-align: 0.25rem;
  }

  .edge {
    margin-left: 0.25rem;
    color: var(--ok);
    font-size: 0.75rem;
    vertical-align: 0.2rem;
  }

  .edge.dis {
    color: var(--hp);
  }

  /* Against the character the colours swap: enemies rolling with disadvantage is good news. */
  .against.adv {
    color: var(--hp);
  }

  .against.dis {
    color: var(--ok);
  }

  small.against {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .chip.switch {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* The switch's state in form as well as colour: an empty ring when off, a filled dot when on. */
  .dot {
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid currentColor;
    border-radius: 50%;
  }

  .chip.on .dot {
    background: currentColor;
  }

  /* "Change" in the card's head: a quiet button, so the switches stay the main thing here. */
  .change {
    min-height: 44px;
    margin: -0.5rem -0.25rem 0 0;
    border-color: transparent;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
  }

  /* A line of its own between the chips: the toggles after it start a new row. */
  .effect-on {
    flex-basis: 100%;
    margin: 0.125rem 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  /* A condition in the hit points' red: it is bad news, unlike an effect that is on. */
  .chip.cond,
  .chip.cond:not(:disabled):hover {
    border-color: var(--hp);
    background: var(--hp-soft);
    color: var(--hp);
    font-weight: 700;
  }

  .k {
    font-size: 0.8125rem;
    line-height: 1.2;
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

  /* Heroic Inspiration and the reaction: chips that tick, the box inside so the whole chip is the tap area. */
  .tick {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.875rem;
    border: 1px solid var(--line);
    background: var(--surface);
    cursor: pointer;
  }

  .tick input {
    width: 1.125rem;
    height: 1.125rem;
    margin: 0;
    accent-color: var(--accent);
  }

  .tick.ticked {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }

  .tick:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .tick:has(input:disabled) {
    cursor: default;
    opacity: 0.6;
  }

  .exhaustion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 1rem;
    font-weight: 700;
  }
</style>
