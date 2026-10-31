<!--
  Build step 4: the ability scores (M6, as drawn). One row per ability with MPMB's columns: the base
  score (made by the standard array, point buy or typed in), the background's +2/+1, feats & level-ups,
  magic (read only: it comes from the magic items) and the total. Every change goes into MPMB's own
  columns through its Ability Scores dialog, which the app answers, so MPMB adds them up as always.
-->
<script lang="ts">
  import {
    POINT_BUDGET,
    STANDARD_ARRAY,
    backgroundBonusOf,
    backgroundColumn,
    backgroundDone,
    bonusOf,
    canRaise,
    changesOf,
    clampTyped,
    methodOf,
    modifierOf,
    pickArray,
    pointsUsed,
    stepBonus,
    tapBackground,
    toArray,
    toPoints,
    totalsOf,
    withColumn,
    withScore,
    POINT_MIN,
    TYPED_MAX,
    TYPED_MIN,
  } from '../../build/abilities.ts';
  import type { Method } from '../../build/abilities.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import type { ScoreChange, ScoreColumn } from '../../engine/scores.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';

  interface Props {
    info: BuilderInfo;
    disabled: boolean;
    change: (steps: Step[]) => void;
    setScores: (changes: ScoreChange[]) => void;
    t: Texts;
  }

  let { info, disabled, change, setScores, t }: Props = $props();

  /** Columns written but not yet read back from MPMB: shown meanwhile, so quick taps count from them. */
  let pending: ScoreColumn[] | null = $state(null);
  $effect(() => {
    void info;
    pending = null;
  });
  const columns = $derived(pending ?? info.scores.columns);
  const columnScores = (type: string): number[] | undefined => columns.filter((c) => c.type === type)[0]?.scores;
  const base = $derived(columnScores('base') ?? Array.from({ length: 6 }, () => POINT_MIN));
  const backgroundCol = $derived(columnScores('background'));
  const bonus = $derived(bonusOf(columns));
  // MPMB's fields are empty on a blank sheet; then the totals are what the columns add up to.
  const totals = $derived(
    pending || info.scores.totals.some((n) => !n) ? totalsOf(columns, info.scores.ongoing) : info.scores.totals,
  );

  /** The way the player picked in this visit; otherwise how the scores look made. */
  let picked = $state<Method | null>(null);
  const method = $derived<Method>(picked ?? methodOf(base));
  const used = $derived(pointsUsed(base));

  const background = $derived(info.origins.backgrounds.filter((b) => b.key === info.origins.background.key)[0]);
  // A background without abilities MPMB can read (an older add-on) lets the bonus go anywhere.
  const allowed = $derived(background?.abilities.length ? background.abilities : [0, 1, 2, 3, 4, 5]);
  const bgBonus = $derived(backgroundCol ? backgroundBonusOf(backgroundCol, allowed) : null);

  const names = $derived([t.abilityStr, t.abilityDex, t.abilityCon, t.abilityInt, t.abilityWis, t.abilityCha]);
  const shorts = $derived([t.shortStr, t.shortDex, t.shortCon, t.shortInt, t.shortWis, t.shortCha]);
  const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

  function write(next: ScoreColumn[]) {
    const changes = changesOf(info.scores.columns, next);
    pending = next;
    if (changes.length) setScores(changes);
  }

  const writeBase = (scores: number[]) => write(withColumn(columns, 'base', scores));

  function setMethod(next: Method) {
    picked = next;
    if (next === 'array' && methodOf(base) !== 'array') writeBase(toArray(base));
    if (next === 'points') {
      const clamped = toPoints(base);
      if (clamped.some((n, i) => n !== base[i])) writeBase(clamped);
    }
  }

  function tapBg(ability: number, amount: 1 | 2) {
    if (!bgBonus) return;
    write(withColumn(columns, 'background', backgroundColumn(tapBackground(bgBonus, ability, amount), allowed)));
  }

  function allThree() {
    write(withColumn(columns, 'background', backgroundColumn({ plus2: null, plus1: null, allThree: true }, allowed)));
  }

  const holderOf = (value: number, ability: number): number => base.findIndex((n, i) => n === value && i !== ability);
</script>

<section class="card">
  <header class="head">
    <div>
      <h2>{t.buildAbilities}</h2>
      <p>
        {t.buildScoresLine}{#if method === 'points' && used !== null}
          · <span class:over={used > POINT_BUDGET}
            >{used > POINT_BUDGET
              ? fill(t.buildPointsOver, { over: used - POINT_BUDGET })
              : fill(t.buildPointsLeft, { left: POINT_BUDGET - used, budget: POINT_BUDGET })}</span
          >{/if}
      </p>
    </div>
    <div class="seg" role="group" aria-label={t.buildMethod}>
      {#each [['array', t.buildMethodArray], ['points', t.buildMethodPoints], ['typed', t.buildMethodTyped]] as [key, label] (key)}
        <button type="button" aria-pressed={method === key} {disabled} onclick={() => setMethod(key as Method)}
          >{label}</button
        >
      {/each}
    </div>
  </header>

  <div class="tiles">
    {#each shorts as short, i (short)}
      <div class="tile">
        <span class="abbr">{short}</span>
        <b>{totals[i]}</b>
        <span class="mod">{signed(modifierOf(totals[i] ?? 0))}</span>
      </div>
    {/each}
  </div>

  <div class="table" role="table" aria-label={t.buildAbilities}>
    <div class="row header" role="row">
      <span role="columnheader">{t.buildColAbility}</span>
      <span role="columnheader" class="c">{t.buildColBase}</span>
      <span role="columnheader">{t.buildBackground}</span>
      <span role="columnheader" class="c">{t.buildColBonus}</span>
      <span role="columnheader" class="magic">{t.buildColMagic}</span>
      <span role="columnheader" class="r">{t.buildColTotal}</span>
    </div>
    {#each names as name, i (name)}
      <div class="row" role="row">
        <span role="rowheader" class="name"
          ><span class="long">{name}</span><span class="short" aria-hidden="true">{shorts[i]}</span></span
        >
        <span role="cell" class="c base">
          {#if method === 'array'}
            <select
              aria-label={fill(t.buildBaseOf, { ability: name })}
              value={base[i]}
              {disabled}
              onchange={(e) => writeBase(pickArray(base, i, Number(e.currentTarget.value)))}
            >
              {#if !STANDARD_ARRAY.includes(base[i] ?? 0)}<option value={base[i]}>{base[i]}</option>{/if}
              {#each STANDARD_ARRAY as value (value)}
                <option {value}
                  >{holderOf(value, i) === -1
                    ? value
                    : fill(t.buildArrayHeld, { value, ability: shorts[holderOf(value, i)] ?? '' })}</option
                >
              {/each}
            </select>
          {:else if method === 'points'}
            <span class="stepper">
              <button
                type="button"
                aria-label={fill(t.buildScoreDown, { ability: name })}
                disabled={disabled || (base[i] ?? 0) <= POINT_MIN}
                onclick={() => writeBase(withScore(base, i, (base[i] ?? 0) - 1))}>−</button
              >
              <b>{base[i]}</b>
              <button
                type="button"
                aria-label={fill(t.buildScoreUp, { ability: name })}
                disabled={disabled || !canRaise(base, i)}
                onclick={() => writeBase(withScore(base, i, (base[i] ?? 0) + 1))}>+</button
              >
            </span>
          {:else}
            <input
              type="number"
              inputmode="numeric"
              min={TYPED_MIN}
              max={TYPED_MAX}
              aria-label={fill(t.buildBaseOf, { ability: name })}
              value={base[i]}
              {disabled}
              onchange={(e) => writeBase(withScore(base, i, clampTyped(Number(e.currentTarget.value) || POINT_MIN)))}
            />
          {/if}
        </span>
        <span role="cell" class="bg">
          {#if bgBonus && background && allowed.includes(i)}
            {#each [2, 1] as amount (amount)}
              <button
                type="button"
                class="chip"
                aria-pressed={bgBonus.allThree ? amount === 1 : (amount === 2 ? bgBonus.plus2 : bgBonus.plus1) === i}
                aria-label={fill(t.buildBgBonus, { ability: name, n: amount })}
                {disabled}
                onclick={() => tapBg(i, amount as 1 | 2)}>+{amount}</button
              >
            {/each}
          {:else if backgroundCol?.[i]}
            <span class="fixed">{signed(backgroundCol[i] ?? 0)}</span>
          {:else}
            <span class="dash">–</span>
          {/if}
        </span>
        <span role="cell" class="c">
          <span class="stepper">
            <button
              type="button"
              aria-label={fill(t.buildScoreDown, { ability: `${name} (${t.buildColBonus})` })}
              disabled={disabled || (bonus[i] ?? 0) <= 0}
              onclick={() => write(stepBonus(columns, i, -1))}>−</button
            >
            <b>{bonus[i] ? signed(bonus[i] ?? 0) : '–'}</b>
            <button
              type="button"
              aria-label={fill(t.buildScoreUp, { ability: `${name} (${t.buildColBonus})` })}
              {disabled}
              onclick={() => write(stepBonus(columns, i, 1))}>+</button
            >
          </span>
        </span>
        <span role="cell" class="magic" class:none={!info.scores.magic[i]} lang="en">{info.scores.magic[i] || '–'}</span
        >
        <span role="cell" class="r total">{totals[i]}</span>
      </div>
    {/each}
  </div>

  <div class="notes">
    {#if background && bgBonus}
      <p>
        <b>{background.name}:</b> <span lang="en">{background.scoresText}</span>
        {#if backgroundDone(bgBonus)}<span class="done">{t.buildBgDone}</span>{:else}<span class="open"
            >{t.buildBgOpen}</span
          >{/if}
        {#if allowed.length === 3 && !bgBonus.allThree}
          <button type="button" class="quiet all" {disabled} onclick={allThree}>{t.buildAllThree}</button>
        {/if}
      </p>
    {:else}
      <p>{t.buildNoBackgroundYet}</p>
    {/if}
    {#each info.scores.improvements as imp (imp.name)}
      <p>
        {fill(counted(t.buildImprovementsOne, t.buildImprovements, imp.count), {
          class: imp.name,
          level: imp.level,
          count: imp.count,
        })}
      </p>
    {/each}
    <div class="more">
      <span>{t.buildScoresMore}</span>
      <button type="button" {disabled} onclick={() => change([{ click: 'Ability Scores Button' }])}
        >{t.buildOpenScores}</button
      >
    </div>
  </div>
</section>

<style>
  .card {
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .head p {
    margin: 0.125rem 0 0;
    color: var(--ink-muted);
  }

  .over {
    color: var(--danger);
    font-weight: 700;
  }

  .seg {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tile {
    display: grid;
    justify-items: center;
    padding: 0.375rem 0.25rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    line-height: 1.2;
  }

  .tile b {
    font-size: 1.5rem;
    font-weight: 800;
  }

  .abbr,
  .mod {
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  /* One grid per row with the same columns, so the table lines up and can rearrange on narrow screens. */
  .row {
    display: grid;
    grid-template-columns: minmax(6.5rem, 1fr) 8rem 6rem 8rem minmax(6rem, 1.2fr) 3rem;
    gap: 0.5rem;
    align-items: center;
    min-height: 52px;
    padding: 0.25rem 0;
    border-top: 1px solid var(--line);
  }

  .row.header {
    min-height: 0;
    border-top: 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .c {
    display: flex;
    justify-content: center;
  }

  .r {
    text-align: right;
  }

  .total {
    font-size: 1.125rem;
    font-weight: 800;
  }

  .magic {
    min-width: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .stepper {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .stepper button {
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 1.25rem;
  }

  .stepper b {
    min-width: 2rem;
    text-align: center;
  }

  select,
  input {
    width: 6.5rem;
    min-height: 44px;
    padding: 0 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    text-align: center;
  }

  .bg {
    display: flex;
    gap: 0.375rem;
  }

  .chip {
    padding: 0 0.5rem;
    color: var(--ink-muted);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .dash,
  .fixed {
    color: var(--ink-muted);
  }

  .notes {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: var(--accent-soft);
  }

  .notes p {
    margin: 0 0 0.375rem;
  }

  .done {
    color: var(--ok);
    font-weight: 700;
  }

  .open {
    color: var(--danger);
    font-weight: 700;
  }

  .all {
    margin-left: 0.25rem;
    color: var(--accent);
  }

  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .short {
    display: none;
  }

  /* iPad upright (the step is about 520 px wide): short names, and magic under the row when there is any. */
  @media (max-width: 999px) {
    .row {
      grid-template-columns: minmax(2.75rem, 1fr) 8rem 6rem 8rem 2.5rem;
    }

    .long {
      display: none;
    }

    .short {
      display: inline;
      font-weight: 700;
    }

    .row .magic {
      grid-column: 1 / -1;
      margin-top: -0.25rem;
    }

    .row.header .magic,
    .row .magic.none {
      display: none;
    }

    .tiles {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
