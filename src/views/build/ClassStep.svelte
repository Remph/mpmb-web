<!--
  Build step 1: name, classes and levels (M6). It replaces MPMB's Class Selection dialog: one row per class,
  each change written to MPMB's "Class and Levels" field, which MPMB reads as if the player had typed it.
-->
<script lang="ts">
  import {
    addClass,
    classFieldText,
    meetsPrereqs,
    nextLevelXp,
    removeClass,
    rowsOf,
    setClass,
    setLevel,
    setSubclass,
    totalLevel,
    MAX_LEVEL,
  } from '../../build/classes.ts';
  import type { ClassRow } from '../../build/classes.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES, numberOf, shown, valueOf } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import PickList from './PickList.svelte';

  interface Props {
    info: BuilderInfo;
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    onlevelup: () => void;
    /** Asks the player before a class is removed (true: remove it). */
    confirmRemove: (name: string, first: boolean) => Promise<boolean>;
    t: Texts;
  }

  let { info, fields, disabled, change, onlevelup, confirmRemove, t }: Props = $props();

  /** Rows written but not yet read back from MPMB: shown meanwhile, so quick taps count from them. */
  let pending: ClassRow[] | null = $state(null);
  $effect(() => {
    // Fresh information from the sheet replaces what was waiting.
    void info;
    pending = null;
  });
  const rows = $derived(pending ?? rowsOf(info.known));
  const level = $derived(totalLevel(rows));
  const scores = $derived(Object.fromEntries(ABILITIES.map((a) => [a, numberOf(fields, a)])));
  const xp = $derived(numberOf(fields, 'Total Experience') ?? 0);
  const nextXp = $derived(nextLevelXp(level, info.xpTable));
  const proficiency = $derived(shown(fields, 'Proficiency Bonus'));

  let picking: { kind: 'class' | 'subclass' | 'add'; index: number } | null = $state(null);

  const classInfo = (key: string) => info.classes.filter((c) => c.key === key)[0];

  function write(next: ClassRow[]) {
    pending = next;
    change([{ edit: 'Class and Levels', text: classFieldText(next, info.classes) }]);
  }

  async function remove(index: number) {
    const row = rows[index];
    if (!row || !(await confirmRemove(classInfo(row.key)?.name ?? row.key, index === 0 && rows.length > 1))) return;
    // The rows may have changed while the question was open: remove the class by its key.
    const now = rows.findIndex((r) => r.key === row.key);
    if (now >= 0) write(removeClass(rows, now));
  }

  function prereqNote(key: string): string {
    const text = classInfo(key)?.prereqs ?? '';
    const met = meetsPrereqs(text, scores);
    if (!text) return '';
    return `${fill(t.buildNeeds, { what: text })} ${met === false ? t.buildNotMet : met ? '✓' : ''}`.trim();
  }

  function note(row: ClassRow, index: number): string {
    const die = classInfo(row.key)?.die;
    return [
      index === 0 ? t.buildFirstClass : '',
      die ? fill(t.buildHitDie, { die }) : '',
      // Prerequisites matter only for multiclassing.
      rows.length > 1 ? prereqNote(row.key) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const pickOptions = $derived.by(() => {
    if (!picking) return [];
    if (picking.kind === 'subclass') {
      const cls = classInfo(rows[picking.index]?.key ?? '');
      return [
        { value: '', label: t.buildNoSubclass },
        ...(cls?.subclasses ?? []).map((s) => ({ value: s.key, label: s.name, source: s.source })),
      ];
    }
    const index = picking.index;
    const taken = rows.filter((_, i) => i !== index).map((r) => r.key);
    return info.classes
      .filter((c) => !taken.includes(c.key))
      .map((c) => ({
        value: c.key,
        label: c.name,
        line: [fill(t.buildHitDie, { die: c.die }), c.prereqs && fill(t.buildNeeds, { what: c.prereqs })]
          .filter(Boolean)
          .join(' · '),
        source: c.source,
      }));
  });

  function picked(value: string) {
    const p = picking;
    picking = null;
    if (!p) return;
    if (p.kind === 'add') write(addClass(rows, value));
    else if (p.kind === 'class') write(setClass(rows, p.index, value));
    else write(setSubclass(rows, p.index, value));
  }
</script>

<section class="card">
  <label class="name">
    <span class="lbl">{t.buildName}</span>
    <input
      type="text"
      value={valueOf(fields, 'PC Name')}
      {disabled}
      onchange={(e) => change([{ edit: 'PC Name', text: e.currentTarget.value }])}
    />
  </label>
</section>

<section class="card">
  <header class="head">
    <div>
      <h2>{t.buildClassTitle}</h2>
      <p>
        {[
          level ? fill(t.buildLevel, { level }) : t.buildNoClass,
          fill(t.buildXp, { xp: xp.toLocaleString(t.locale) }),
          proficiency && level ? fill(t.buildProficiency, { bonus: proficiency }) : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
    {#if rows.length}
      <button type="button" class="primary" disabled={disabled || level >= MAX_LEVEL} onclick={onlevelup}>
        {t.levelUp}
      </button>
    {/if}
  </header>

  {#each rows as row, i (row.key)}
    <div class="row">
      <div class="cls">
        <span class="lbl">{t.buildClass}</span>
        <button type="button" class="pick" {disabled} onclick={() => (picking = { kind: 'class', index: i })}>
          <span>{classInfo(row.key)?.name ?? row.key}</span>
          <span class="src">{classInfo(row.key)?.source ?? ''}</span>
        </button>
      </div>
      <div class="sub">
        <span class="lbl">{t.buildSubclass}</span>
        <button type="button" class="pick" {disabled} onclick={() => (picking = { kind: 'subclass', index: i })}>
          <span
            >{classInfo(row.key)?.subclasses.filter((s) => s.key === row.subclass)[0]?.name ?? t.buildNoSubclass}</span
          >
        </button>
      </div>
      <div class="lvl">
        <span class="lbl" id={`level-${i}`}>{t.buildLevelLabel}</span>
        <div class="stepper" role="group" aria-labelledby={`level-${i}`}>
          <button
            type="button"
            aria-label={t.buildLevelDown}
            disabled={disabled || row.level <= 1}
            onclick={() => write(setLevel(rows, i, row.level - 1))}>−</button
          >
          <span>{row.level}</span>
          <button
            type="button"
            aria-label={t.buildLevelUp}
            disabled={disabled || level >= MAX_LEVEL}
            onclick={() => write(setLevel(rows, i, row.level + 1))}>+</button
          >
        </div>
      </div>
      <button
        type="button"
        class="quiet remove"
        aria-label={fill(t.buildRemoveClass, { name: classInfo(row.key)?.name ?? row.key })}
        title={fill(t.buildRemoveClass, { name: classInfo(row.key)?.name ?? row.key })}
        {disabled}
        onclick={() => remove(i)}>✕</button
      >
      {#if note(row, i)}<p class="note">{note(row, i)}</p>{/if}
    </div>
  {/each}

  <button
    type="button"
    class="add"
    class:primary={!rows.length}
    disabled={disabled || level >= MAX_LEVEL}
    onclick={() => (picking = { kind: 'add', index: rows.length })}
  >
    {rows.length ? t.buildAddClass : t.buildChooseClass}
  </button>
</section>

<div class="pair">
  <section class="card">
    <h3>{t.buildHitPoints}</h3>
    <div class="line">
      <p>
        {fill(t.buildMaxHp, { hp: shown(fields, 'HP Max') || '–' })}<br /><small>{t.buildHpHow}</small>
      </p>
      <button type="button" {disabled} onclick={() => change([{ click: 'Buttons.HP Max' }])}>{t.buildChange}</button>
    </div>
  </section>
  <section class="card">
    <h3>{t.buildExperience}</h3>
    <div class="line">
      <p>
        {fill(t.buildXp, { xp: xp.toLocaleString(t.locale) })}
        {#if nextXp !== null}<br /><small
            >{fill(t.buildNextLevelAt, { level: level + 1, xp: nextXp.toLocaleString(t.locale) })}</small
          >{/if}
      </p>
      <button type="button" {disabled} onclick={() => change([{ click: 'Add Experience Button' }])}
        >{t.buildAddXp}</button
      >
    </div>
  </section>
</div>

{#if picking}
  <PickList
    title={picking.kind === 'subclass' ? t.buildSubclass : picking.kind === 'add' ? t.buildAddClass : t.buildClass}
    options={pickOptions}
    current={picking.kind === 'subclass' ? (rows[picking.index]?.subclass ?? '') : (rows[picking.index]?.key ?? '')}
    onpick={picked}
    onclose={() => (picking = null)}
    {t}
  />
{/if}

<style>
  .card {
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }

  .head p {
    margin: 0.125rem 0 0;
    color: var(--ink-muted);
  }

  .lbl {
    display: block;
    margin-bottom: 0.125rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .name {
    display: block;
  }

  input {
    width: 100%;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(9rem, 1.1fr) minmax(10rem, 1.4fr) auto 44px;
    gap: 0.5rem 0.75rem;
    align-items: end;
    padding: 0.75rem 0;
    border-top: 1px solid var(--line);
  }

  .row:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
  }

  .pick span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick::after {
    content: '▾';
    margin-left: auto;
    color: var(--ink-muted);
  }

  .src {
    flex: none;
    margin-left: auto;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .stepper {
    display: flex;
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

  .stepper span {
    min-width: 2.25rem;
    font-size: 1.125rem;
    font-weight: 800;
    text-align: center;
  }

  .remove {
    padding: 0;
  }

  .note {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .add {
    width: 100%;
    margin-top: 0.5rem;
  }

  .add:not(.primary) {
    border-style: dashed;
    color: var(--accent);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 0.75rem;
  }

  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .line p {
    margin: 0;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  @media (max-width: 900px) {
    .row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 44px;
    }

    .lvl {
      grid-column: 1 / 3;
    }

    .remove {
      grid-row: 1;
      grid-column: 3;
    }
  }
</style>
