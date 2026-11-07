<!--
  The Effects card's window: set up the features the player switches on and off (src/play/effects.ts).
  Changes stay in copies until Save. An effect that is on can't be changed here: its switch remembers
  what it wrote into the sheet, and a different bonus would take out something it never put in.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill, type Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { FieldViews } from '../../worker/views.ts';
  import { ABILITIES } from '../../play/read.ts';
  import {
    MAX_AC_NUMBER,
    MAX_EFFECTS,
    MAX_NAME,
    effectOn,
    newEffect,
    weaponRows,
    type Effect,
    type EffectAbility,
  } from '../../play/effects.ts';
  import Stepper from './Stepper.svelte';

  interface Props {
    effects: Effect[];
    fields: FieldViews;
    onsave: (effects: Effect[]) => void;
    onclose: () => void;
    t: Texts;
  }

  let { effects, fields, onsave, onclose, t }: Props = $props();

  const copy = (e: Effect): Effect => ({ ...e, applied: e.applied && $state.snapshot(e.applied) });
  // A new character's first effect opens ready to fill in.
  let list: Effect[] = $state(
    untrack(() => (effects.length ? effects.map(copy) : [newEffect(crypto.randomUUID(), '')])),
  );
  const CHOICES: ('' | EffectAbility)[] = ['', ...ABILITIES];
  const abilityText = (a: '' | EffectAbility, none: string): string => (a ? t[`short${a}`] : none);
  const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

  function add() {
    list.push(newEffect(crypto.randomUUID(), ''));
  }

  function save() {
    // An effect without a name gets the generic one, so its switch always has a label.
    onsave(list.map((e) => ({ ...e, name: e.name.trim() || t.addEffect })));
    onclose();
  }
</script>

<Modal title={t.effectsTitle} onescape={onclose} closeLabel={t.close} wide>
  <form
    id="effects-form"
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <p class="hint">{t.effectsIntro}</p>
    {#each list as effect, i (effect.id)}
      {@const on = effectOn(effect)}
      {@const rows = weaponRows(fields, effect.weaponAbility)}
      <fieldset class="effect" disabled={on}>
        <legend class="sr">{effect.name || t.addEffect}</legend>
        <div class="top">
          <label class="name"
            >{t.effectName}<input
              type="text"
              maxlength={MAX_NAME}
              placeholder={t.effectNamePlaceholder}
              bind:value={effect.name}
            /></label
          >
          <button
            type="button"
            class="remove"
            aria-label={fill(t.effectRemoveLabel, { name: effect.name || t.addEffect })}
            onclick={() => list.splice(i, 1)}>{t.effectRemove}</button
          >
        </div>
        {#if on}<p class="note">{t.effectIsOn}</p>{/if}
        <div class="part">
          <span class="label" id={`ac-${effect.id}`}>{t.effectAc}</span>
          <div class="row">
            <div class="choices" role="group" aria-labelledby={`ac-${effect.id}`}>
              {#each CHOICES as a (a)}
                <button
                  type="button"
                  class="choice"
                  aria-pressed={effect.acAbility === a}
                  onclick={() => (effect.acAbility = a)}>{abilityText(a, t.effectNone)}</button
                >
              {/each}
            </div>
            <Stepper
              text={signed(effect.acNumber)}
              name={`${t.effectAc}: ${t.effectAcNumber}`}
              canLess={effect.acNumber > -MAX_AC_NUMBER}
              canMore={effect.acNumber < MAX_AC_NUMBER}
              disabled={on}
              onless={() => (effect.acNumber -= 1)}
              onmore={() => (effect.acNumber += 1)}
              {t}
            />
          </div>
        </div>
        <div class="part">
          <span class="label" id={`weapon-${effect.id}`}>{t.effectWeapon}</span>
          <div class="choices" role="group" aria-labelledby={`weapon-${effect.id}`}>
            {#each CHOICES as a (a)}
              <button
                type="button"
                class="choice"
                aria-pressed={effect.weaponAbility === a}
                onclick={() => (effect.weaponAbility = a)}>{abilityText(a, t.effectSame)}</button
              >
            {/each}
          </div>
          {#if effect.weaponAbility && !on}
            <p class="note">
              {rows.length
                ? fill(t.effectWeaponRows, { names: rows.map((r) => r.name).join(', ') })
                : t.effectWeaponNoRows}
            </p>
          {/if}
        </div>
      </fieldset>
    {/each}
    {#if list.length < MAX_EFFECTS}
      <button type="button" class="add" onclick={add}>+ {t.addEffectLong}</button>
    {/if}
    <p class="hint">{t.effectsHint}</p>
  </form>
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="submit" form="effects-form" class="primary">{t.apply}</button>
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 0.75rem;
  }

  .effect {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
    margin: 0;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.5rem;
  }

  .name {
    display: grid;
    flex: 1 1 12rem;
    gap: 0.25rem;
    min-width: 0;
    font-weight: 600;
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
    font-size: 1.0625rem;
    font-weight: 700;
  }

  .remove {
    min-height: 44px;
  }

  .part {
    display: grid;
    gap: 0.375rem;
  }

  .label {
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
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

  .add {
    justify-self: start;
    min-height: 44px;
    border-style: dashed;
    border-radius: 22px;
  }

  .note,
  .hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }
</style>
