<!--
  The left column while a companion is shown: who it is, its hit points (the same damage and healing rules
  as the character's), the numbers checked every round, and MPMB's own Companion Options menu, which adds a
  creature, changes it, resets the page or removes it.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { companionFields, companionLabel, companionMenu } from '../../play/companions.ts';
  import type { Companion } from '../../play/companions.ts';
  import { applyDamage, applyHealing } from '../../play/rules.ts';
  import NumberPad from './NumberPad.svelte';

  interface Props {
    companion: Companion;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { companion, disabled, change, t }: Props = $props();

  const hp = $derived(companion.hp);
  const current = $derived(hp.current ?? hp.max ?? 0);
  const temp = $derived(hp.temp ?? 0);
  const percent = $derived(`${hp.max ? Math.min(100, (current / hp.max) * 100) : 0}%`);
  const f = $derived(companionFields(companion.prefix));
  const empty = $derived(companion.creature === '' && companion.name === '');
  /** Who it is, under its name: "Sprite · Familiar · Tiny Fey". */
  const subtitle = $derived(
    [
      companion.name ? companion.creature : '',
      companion.kind,
      [companion.size, companion.creatureType].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(' · '),
  );

  let pad: 'damage' | 'heal' | 'temp' | null = $state(null);
  /** An empty field stays empty at full health, as MPMB leaves a fresh companion page. */
  const hpText = (n: number): string => (n === hp.max ? '' : String(n));
  const tempText = (n: number): string => (n > 0 ? String(n) : '');

  function applyPad(amount: number) {
    const kind = pad;
    pad = null;
    if (kind === 'temp') return change([{ edit: f.hpTemp, text: tempText(amount) }]);
    const next = kind === 'damage' ? applyDamage(hp, amount) : applyHealing(hp, amount);
    const steps: Step[] = [];
    if (next.current !== current) steps.push({ edit: f.hpCurrent, text: hpText(next.current) });
    if (next.temp !== temp) steps.push({ edit: f.hpTemp, text: tempText(next.temp) });
    change(steps);
  }

  const options = () => change([{ click: companionMenu(companion.prefix), menuTitle: t.companionMenuTitle }]);

  const tiles = $derived(
    [
      { label: t.acLabel, value: companion.armorClass },
      { label: t.initiative, value: companion.initiative },
      { label: t.proficiency, value: companion.proficiency },
      { label: t.passivePerception, value: companion.passivePerception },
    ].filter((tile) => tile.value !== ''),
  );
  const lines = $derived(
    [
      { label: t.speed, value: companion.speed },
      { label: t.companionSenses, value: companion.senses },
    ].filter((line) => line.value !== ''),
  );
</script>

<section class="panel who" aria-labelledby="companion-name">
  <h2 id="companion-name">{companionLabel(companion) || t.companionEmptyPage}</h2>
  {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  {#if companion.alignment}<p class="muted">{companion.alignment}</p>{/if}
  {#if empty}<p>{t.companionEmpty}</p>{/if}
  <button type="button" class="options" class:primary={empty} {disabled} onclick={options}>{t.companionOptions}</button>
</section>

{#if hp.max !== null}
  <section class="hp" aria-labelledby="companion-hp-title">
    <div class="head">
      <h2 id="companion-hp-title">{t.hpTitle}</h2>
      {#if temp > 0}<span class="temp">{fill(t.tempHp, { count: temp })}</span>{/if}
    </div>
    <p class="numbers"><span class="now">{current}</span> <span class="max">/ {hp.max}</span></p>
    <div class="bar" aria-hidden="true"><i style:width={percent}></i></div>
    <div class="buttons">
      <button type="button" class="primary" {disabled} onclick={() => (pad = 'damage')}>{t.damage}</button>
      <button type="button" {disabled} onclick={() => (pad = 'heal')}>{t.heal}</button>
      <button type="button" {disabled} onclick={() => (pad = 'temp')}>{t.tempHpButton}</button>
    </div>
  </section>
{/if}

{#if tiles.length}
  <div class="tiles">
    {#each tiles as tile (tile.label)}
      <div class="tile"><span class="k">{tile.label}</span><span class="v">{tile.value}</span></div>
    {/each}
  </div>
{/if}
{#each lines as line (line.label)}
  <div class="tile line"><span class="k">{line.label}</span><span class="text">{line.value}</span></div>
{/each}

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

<style>
  section,
  .tiles,
  .tile.line {
    margin-bottom: 0.625rem;
  }

  .panel {
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .who h2 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 800;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0.25rem 0 0;
  }

  .muted,
  .k {
    color: var(--ink-muted);
  }

  .options {
    width: 100%;
    margin-top: 0.75rem;
    color: var(--accent);
    font-weight: 700;
  }

  .options.primary {
    color: var(--on-accent);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .hp h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
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
    font-size: 3rem;
    font-weight: 800;
    line-height: 0.95;
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

  .buttons .primary,
  .buttons .primary:not(:disabled):hover {
    border-color: var(--hp);
    background: var(--hp);
    color: var(--on-hp);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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
  }

  .v {
    font-size: 1.375rem;
    font-weight: 800;
    line-height: 1.2;
  }

  .text {
    font-weight: 700;
    line-height: 1.3;
  }
</style>
