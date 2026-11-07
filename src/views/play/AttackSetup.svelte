<!--
  An attack row's proficiency and ability (the PDF's two boxes in front of the row; Remph picked "a chip
  and a small window", 2026-11-07): the chip names both, a tap opens the window. Each choice goes into
  the sheet at once and MPMB works out the numbers, so the window shows them as they change.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { bonusSteps, readBonuses, readSetup } from '../../play/attack-setup.ts';
  import type { AttackAbility, AttackSetup } from '../../play/attack-setup.ts';
  import { ABILITIES, shown } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';

  interface Props {
    row: number;
    name: string;
    fields: FieldViews;
    disabled: boolean;
    onset: (row: number, set: Partial<AttackSetup>) => void;
    /** For the blue bonus boxes: MPMB keeps them itself, so they are plain field changes. */
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { row, name, fields, disabled, onset, change, t }: Props = $props();

  const setup = $derived(readSetup(fields, row));
  const bonuses = $derived(readBonuses(fields, row));
  const CHOICES: (AttackAbility | '')[] = ['', ...ABILITIES];
  /** MPMB's numbers for the row: "+8 · 2d8+5", "DC 16 · 2d6". */
  const numbers = $derived(
    [shown(fields, `Attack.${row}.To Hit`), shown(fields, `Attack.${row}.Damage`)]
      .map((n) => n.trim())
      .filter(Boolean)
      .join(' · '),
  );
  const label = $derived(
    fill(t.attackSetupChip, {
      ability: setup.ability ? t[`short${setup.ability}`] : t.attackSetupNoAbility,
      prof: setup.proficient ? t.attackSetupProf : t.attackSetupNotProf,
    }),
  );
  // Worth a look: a row with a number to roll or save against that leaves out an ability or proficiency
  // (a spell's DC on no ability, a weapon without training). Rows without a number (a cantrip that adds
  // to a weapon attack) have neither on purpose.
  const odd = $derived(
    shown(fields, `Attack.${row}.To Hit`).trim() !== '' && (setup.ability === '' || !setup.proficient),
  );

  let open = $state(false);
  /** The numbers when the window opened, to show next to the new ones. */
  let before = $state('');

  function show() {
    before = numbers;
    open = true;
  }
</script>

<button
  type="button"
  class="chip"
  class:odd
  aria-haspopup="dialog"
  aria-label={fill(t.attackSetupLabel, { name, state: label })}
  {disabled}
  onclick={show}>{label}</button
>

{#if open}
  <Modal title={name} onescape={() => (open = false)} closeLabel={t.close}>
    <p class="hint">{t.attackSetupIntro}</p>
    <div class="part">
      <span class="label" id={`prof-${row}`}>{t.attackSetupProficient}</span>
      <div class="choices" role="group" aria-labelledby={`prof-${row}`}>
        {#each [true, false] as on (on)}
          <button
            type="button"
            class="choice"
            aria-pressed={setup.proficient === on}
            {disabled}
            onclick={() => onset(row, { proficient: on })}>{on ? t.yes : t.no}</button
          >
        {/each}
      </div>
    </div>
    <div class="part">
      <span class="label" id={`ability-${row}`}>{t.attackSetupAbility}</span>
      <div class="choices" role="group" aria-labelledby={`ability-${row}`}>
        {#each CHOICES as a (a)}
          <button
            type="button"
            class="choice"
            aria-pressed={setup.ability === a}
            {disabled}
            onclick={() => onset(row, { ability: a })}>{a ? t[`short${a}`] : t.attackSetupNone}</button
          >
        {/each}
      </div>
    </div>
    <div class="part">
      <span class="label">{t.attackSetupBonuses}</span>
      <div class="bonuses">
        <label
          >{bonuses.dc ? t.attackSetupDcBonus : t.attackSetupHitBonus}<input
            type="text"
            maxlength="20"
            placeholder="0"
            value={bonuses.hit}
            {disabled}
            onchange={(e) => change(bonusSteps(fields, row, { hit: e.currentTarget.value }))}
          /></label
        >
        <label
          >{t.attackSetupDamageBonus}<input
            type="text"
            maxlength="20"
            placeholder="0"
            value={bonuses.damage}
            {disabled}
            onchange={(e) => change(bonusSteps(fields, row, { damage: e.currentTarget.value }))}
          /></label
        >
      </div>
      <p class="note">{t.attackSetupBonusHint}</p>
    </div>
    {#if numbers || before}
      <!-- Live: MPMB's numbers after each tap, with the ones from before when they changed. -->
      <p class="numbers" aria-live="polite">
        {#if before && before !== numbers}<span class="was">{before}</span> →{' '}{/if}<b
          >{numbers || t.attackSetupNoAbility}</b
        >
      </p>
    {/if}
    <p class="hint">{t.attackSetupHint}</p>
  </Modal>
{/if}

<style>
  .chip {
    min-height: 32px;
    padding: 0 0.625rem;
    border-radius: 16px;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 600;
    white-space: nowrap;
    /* The visible chip is 32 px; the tap area reaches 44 px (touch first). */
    position: relative;
  }

  .chip::after {
    content: '';
    position: absolute;
    inset: -6px 0;
  }

  .chip.odd {
    border-color: var(--accent);
    color: var(--accent);
  }

  .part {
    display: grid;
    gap: 0.375rem;
    margin-top: 0.875rem;
  }

  .label {
    font-weight: 600;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .choice {
    min-width: 44px;
    min-height: 44px;
    padding: 0 0.625rem;
    border-radius: 22px;
  }

  .choice[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .bonuses {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }

  .bonuses label {
    display: grid;
    flex: 1 1 8rem;
    gap: 0.25rem;
    min-width: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  input {
    min-width: 0;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
  }

  .note {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .numbers {
    margin: 0.875rem 0 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    font-weight: 600;
  }

  .numbers b {
    color: var(--accent);
  }

  .was {
    color: var(--ink-muted);
  }

  .hint {
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .hint:first-of-type {
    margin-top: 0;
  }
</style>
