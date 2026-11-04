<!--
  The Dawn button's window: what comes back at dawn (magic items mostly). A charge that comes back in full
  just fills up; one that "regains 1d6+1" shows a roll the app made, which the player can change to the
  roll from the table.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { rollRegain } from '../../play/rules.ts';
  import type { DawnFeature, RegainDice } from '../../play/rules.ts';
  import Stepper from './Stepper.svelte';

  interface Props {
    features: DawnFeature[];
    /** The amount each feature with dice gets back, by row. */
    onapply: (regained: Record<number, number>) => void;
    onclose: () => void;
    t: Texts;
  }

  let { features, onapply, onclose, t }: Props = $props();

  const diceText = (d: RegainDice): string => `${d.count}d${d.sides}${d.bonus ? `+${d.bonus}` : ''}`;
  // The window says "regains 1d4" on its own line, so the name loses MPMB's "(regains 1d4)".
  const plainName = (name: string): string => name.replace(/\s*\(regains? [^)]*\)/i, '');
  const highest = (d: RegainDice): number => d.count * d.sides + d.bonus;

  // Rolled once when the window opens (untracked: a later change to the sheet must not roll again); the
  // − and + change it from there.
  let regained: Record<number, number> = $state(
    untrack(() =>
      Object.fromEntries(features.filter((f) => f.dice && f.used > 0).map((f) => [f.row, rollRegain(f.dice!)])),
    ),
  );

  const back = (f: DawnFeature): number => (f.dice ? (regained[f.row] ?? 0) : f.used);
  const leftAfter = (f: DawnFeature): number => f.max - Math.max(0, f.used - back(f));
  const anyUsed = $derived(features.some((f) => f.used > 0));
</script>

<Modal title={t.dawnTitle} onescape={onclose} closeLabel={t.close}>
  <p class="message">{anyUsed ? t.dawnText : t.dawnNothing}</p>
  <div class="rows">
    {#each features as f (f.row)}
      <div class="row">
        <span class="name"
          >{plainName(f.name)}
          <small
            >{fill(t.dawnLeft, { left: f.max - f.used, total: f.max }) +
              (f.dice ? ` · ${fill(t.dawnRegains, { dice: diceText(f.dice) })}` : '')}</small
          ></span
        >
        {#if f.used === 0}
          <span class="muted">{t.dawnFull}</span>
        {:else if f.dice}
          {@const dice = f.dice}
          <span class="roll">
            <Stepper
              text={`+${regained[f.row] ?? 0}`}
              name={fill(t.dawnRollName, { name: f.name })}
              canLess={(regained[f.row] ?? 0) > 0}
              canMore={(regained[f.row] ?? 0) < highest(dice)}
              onless={() => (regained[f.row] = (regained[f.row] ?? 0) - 1)}
              onmore={() => (regained[f.row] = (regained[f.row] ?? 0) + 1)}
              {t}
            />
            <b>{fill(t.dawnAfter, { left: leftAfter(f), total: f.max })}</b>
          </span>
        {:else}
          <b>{t.dawnAllBack} {fill(t.dawnAfter, { left: f.max, total: f.max })}</b>
        {/if}
      </div>
    {/each}
  </div>
  {#if features.some((f) => f.dice && f.used > 0)}
    <p class="hint">
      {fill(t.dawnRolled, {
        dice: features
          .filter((f) => f.dice && f.used > 0)
          .map((f) => diceText(f.dice!))
          .join(', '),
      })}
    </p>
  {/if}
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" disabled={!anyUsed} onclick={() => onapply($state.snapshot(regained))}
      >{t.dawnApply}</button
    >
  {/snippet}
</Modal>

<style>
  .message {
    margin: 0 0 0.5rem;
  }

  .rows {
    display: grid;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  .row:first-child {
    border-top: 0;
  }

  .name {
    min-width: 0;
    font-weight: 700;
    line-height: 1.2;
  }

  small,
  .muted {
    color: var(--ink-muted);
    font-weight: 400;
  }

  small {
    display: block;
    font-size: 0.8125rem;
  }

  .roll {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hint {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
