<!--
  The form for an own spell (Remph picked design A, 2026-11-08): a spell MPMB doesn't know, typed in once and
  added to one spell source as an extra row. Saving hands the values back; the step writes the script.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import {
    BLANK_SPELL,
    DAMAGE_TYPES,
    SAVES,
    SCHOOLS,
    TIMES,
    problems,
    suggestLine,
    validDice,
  } from '../../build/own-spells.ts';
  import type { OwnSpell, Roll } from '../../build/own-spells.ts';

  interface Props {
    /** The spell to change, or null for a new one. */
    initial: OwnSpell | null;
    /** The spell source it goes to ("Wizard"). */
    sourceName: string;
    /** The character's other own spells, so that two don't share a name. */
    others: OwnSpell[];
    busy: boolean;
    onsave: (spell: OwnSpell) => void;
    /** Deletes the spell (only when changing one). */
    ondelete: (() => void) | null;
    oncancel: () => void;
    t: Texts;
  }

  let { initial, sourceName, others, busy, onsave, ondelete, oncancel, t }: Props = $props();

  // The form is a copy: nothing changes until Save. The window opens anew for each spell, so `initial` is read once.
  const start = (): OwnSpell => ({ ...BLANK_SPELL, ...(initial ?? {}) });
  const first = start();
  let spell = $state<OwnSpell>({ ...first });
  /**
   * The line follows the fields until the player types their own; a spell saved with a line of its own
   * keeps it when it opens again.
   */
  let ownLine = $state<string | null>(first.line !== suggestLine(first) ? first.line : null);
  const line = $derived(ownLine ?? suggestLine(spell));
  /** "Other …" shows a text box for a casting time the chips don't have. */
  let otherTime = $state(!(TIMES as readonly string[]).includes(first.time));
  let deleting = $state(false);
  /** Problems show only after a save was tried, not while the player is still typing. */
  let tried = $state(false);

  const found = $derived(problems({ ...spell, line }, others));
  const die = $derived(validDice(spell.damage) ? spell.damage.trim().replace(/^\d+d/, '') : '');

  const TIME_LABELS: Record<(typeof TIMES)[number], keyof Texts> = {
    Act: 'action',
    Bns: 'bonusAction',
    React: 'reaction',
    '1 min': 'ownSpellMinute',
  };
  const SCHOOL_LABELS: Record<Exclude<(typeof SCHOOLS)[number], ''>, keyof Texts> = {
    Abjur: 'school_Abjuration',
    Conj: 'school_Conjuration',
    Div: 'school_Divination',
    Ench: 'school_Enchantment',
    Evoc: 'school_Evocation',
    Illus: 'school_Illusion',
    Necro: 'school_Necromancy',
    Trans: 'school_Transmutation',
  };
  const ROLLS: Roll[] = ['', 'attack', ...SAVES];
  const rollLabel = (roll: Roll): string =>
    roll === '' ? t.ownSpellNoRoll : roll === 'attack' ? t.ownSpellAttack : t[`short${roll}`];
  const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  const messages = $derived(
    [
      found.name === 'empty' ? t.ownSpellNameEmpty : found.name === 'taken' ? t.ownSpellNameTaken : '',
      found.damage ? t.ownSpellDiceBad : '',
      found.line ? t.ownSpellLineEmpty : '',
    ].filter(Boolean),
  );

  function save() {
    tried = true;
    if (busy || messages.length) return;
    onsave({ ...$state.snapshot(spell), line: line.trim() });
  }
</script>

{#snippet chip(pressed: boolean, label: string, pick: () => void, aria?: string)}
  <button type="button" class="choice" aria-pressed={pressed} aria-label={aria} disabled={busy} onclick={pick}
    >{label}</button
  >
{/snippet}

{#snippet actions()}
  {#if ondelete}
    {#if deleting}
      <button type="button" class="danger" disabled={busy} onclick={ondelete}>{t.ownSpellDeleteSure}</button>
    {:else}
      <button type="button" class="quiet delete" disabled={busy} onclick={() => (deleting = true)}
        >{t.ownSpellDelete}</button
      >
    {/if}
  {/if}
  <button type="button" disabled={busy} onclick={oncancel}>{t.cancel}</button>
  <button type="button" class="primary" disabled={busy} onclick={save}
    >{busy ? t.ownSpellSaving : initial ? t.ownSpellSaveEdit : fill(t.ownSpellSaveNew, { name: sourceName })}</button
  >
{/snippet}

<Modal
  title={initial ? fill(t.ownSpellTitleEdit, { name: initial.name }) : fill(t.ownSpellTitleNew, { name: sourceName })}
  onescape={oncancel}
  closeLabel={t.close}
  wide
  {actions}
>
  <div class="form">
    <p class="intro">{t.ownSpellIntro}</p>
    {#if deleting}<p class="note warn">{t.ownSpellDeleteLine}</p>{/if}
    {#if tried && messages.length}
      <ul class="problems" role="alert">
        {#each messages as message (message)}<li>{message}</li>{/each}
      </ul>
    {/if}

    <div class="grid">
      <label class="part">
        <span class="label">{t.ownSpellName}</span>
        <input
          type="text"
          maxlength="60"
          autocomplete="off"
          aria-invalid={tried && !!found.name}
          bind:value={spell.name}
          disabled={busy}
        />
      </label>
      <label class="part">
        <span class="label">{t.ownSpellSchool} <small>{t.ownSpellOptional}</small></span>
        <select bind:value={spell.school} disabled={busy}>
          {#each SCHOOLS as school (school)}
            <option value={school}>{school ? t[SCHOOL_LABELS[school]] : t.ownSpellNoSchool}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="part" role="group" aria-labelledby="own-level">
      <span class="label" id="own-level">{t.ownSpellLevel}</span>
      <div class="choices">
        {#each LEVELS as level (level)}
          {@render chip(spell.level === level, level ? String(level) : t.ownSpellCantrip, () => (spell.level = level))}
        {/each}
      </div>
    </div>

    <div class="part" role="group" aria-labelledby="own-time">
      <span class="label" id="own-time">{t.castingTime}</span>
      <div class="choices">
        {#each TIMES as time (time)}
          {@render chip(!otherTime && spell.time === time, t[TIME_LABELS[time]], () => {
            otherTime = false;
            spell.time = time;
          })}
        {/each}
        {@render chip(otherTime, t.ownSpellOtherTime, () => {
          otherTime = true;
          spell.time = '';
        })}
      </div>
      {#if otherTime}
        <input type="text" maxlength="40" aria-label={t.ownSpellTimeTyped} bind:value={spell.time} disabled={busy} />
      {/if}
    </div>

    <div class="grid">
      <label class="part">
        <span class="label">{t.spellRange}</span>
        <input type="text" maxlength="40" placeholder="120 ft" bind:value={spell.range} disabled={busy} />
        <span class="note">{t.ownSpellRangeHint}</span>
      </label>
      <label class="part">
        <span class="label">{t.spellDuration}</span>
        <input type="text" maxlength="40" bind:value={spell.duration} disabled={busy} />
      </label>
    </div>

    <div class="part" role="group" aria-labelledby="own-components">
      <span class="label" id="own-components">{t.spellComponents}</span>
      <div class="choices">
        {@render chip(spell.verbal, t.ownSpellCompV, () => (spell.verbal = !spell.verbal), t.ownSpellCompVLabel)}
        {@render chip(spell.somatic, t.ownSpellCompS, () => (spell.somatic = !spell.somatic), t.ownSpellCompSLabel)}
        {@render chip(
          spell.material !== null,
          t.ownSpellCompM,
          () => (spell.material = spell.material === null ? '' : null),
          t.ownSpellCompMLabel,
        )}
        {@render chip(spell.concentration, t.concentration, () => (spell.concentration = !spell.concentration))}
        {@render chip(spell.ritual, t.spellRitual, () => (spell.ritual = !spell.ritual))}
      </div>
      {#if spell.material !== null}
        <input
          type="text"
          maxlength="120"
          aria-label={t.ownSpellMaterial}
          placeholder={t.ownSpellMaterial}
          bind:value={spell.material}
          disabled={busy}
        />
      {/if}
    </div>

    <div class="part" role="group" aria-labelledby="own-roll">
      <span class="label" id="own-roll">{t.ownSpellRoll}</span>
      <div class="choices">
        {#each ROLLS as roll (roll)}
          {@render chip(spell.roll === roll, rollLabel(roll), () => (spell.roll = roll))}
        {/each}
      </div>
    </div>

    <div class="part" role="group" aria-labelledby="own-damage">
      <span class="label" id="own-damage">{t.ownSpellDamage} <small>{t.ownSpellOptional}</small></span>
      <div class="row">
        <input
          class="dice"
          type="text"
          maxlength="8"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="1d10"
          aria-label={t.ownSpellDice}
          aria-invalid={tried && !!found.damage}
          bind:value={spell.damage}
          disabled={busy}
        />
        <select aria-label={t.ownSpellDamageType} bind:value={spell.damageType} disabled={busy}>
          {#each DAMAGE_TYPES as type (type)}
            <option value={type}>{t[`damage_${type}`]}</option>
          {/each}
        </select>
      </div>
      {#if spell.level === 0 && die}
        <label class="check">
          <input type="checkbox" bind:checked={spell.grows} disabled={busy} />
          <span>{fill(t.ownSpellGrows, { die })}</span>
        </label>
      {/if}
    </div>

    <div class="part">
      <label class="label" for="own-line">{t.ownSpellLine}</label>
      <input
        id="own-line"
        type="text"
        maxlength="160"
        autocomplete="off"
        aria-invalid={tried && !!found.line}
        aria-describedby="own-line-hint"
        value={line}
        oninput={(e) => (ownLine = e.currentTarget.value)}
        disabled={busy}
      />
      <span class="note" id="own-line-hint">{t.ownSpellLineHint}</span>
      {#if ownLine !== null}
        <button type="button" class="quiet again" disabled={busy} onclick={() => (ownLine = null)}
          >{t.ownSpellLineAgain}</button
        >
      {/if}
    </div>

    <label class="part">
      <span class="label">{t.ownSpellText} <small>{t.ownSpellTextHint}</small></span>
      <textarea rows="5" maxlength="4000" bind:value={spell.text} disabled={busy}></textarea>
    </label>

    <div class="where">
      <span class="label">{fill(t.ownSpellWhere, { name: sourceName })}</span>
      <p class="note">{fill(t.ownSpellWhereLine, { name: sourceName })}</p>
    </div>
  </div>
</Modal>

<style>
  .form {
    display: grid;
    gap: 0.875rem;
  }

  .intro {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.875rem 1rem;
    /* A hint under one field mustn't stretch the field beside it. */
    align-items: start;
  }

  .part {
    display: grid;
    gap: 0.375rem;
    min-width: 0;
  }

  .label {
    font-weight: 600;
  }

  .label small {
    color: var(--ink-muted);
    font-weight: 400;
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

  input[type='text'],
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }

  textarea {
    padding: 0.5rem 0.75rem;
    line-height: 1.4;
    resize: vertical;
  }

  [aria-invalid='true'] {
    border-color: var(--danger);
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }

  .row .dice {
    flex: 0 0 7rem;
    width: 7rem;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }

  .check input {
    flex: none;
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }

  .note {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .warn {
    color: var(--danger);
  }

  .problems {
    margin: 0;
    padding: 0.5rem 0.75rem 0.5rem 1.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
    color: var(--danger);
  }

  .again {
    justify-self: start;
    color: var(--accent);
    font-weight: 600;
  }

  .where {
    display: grid;
    gap: 0.25rem;
    padding: 0.625rem 0.75rem;
    border: 1px dashed var(--line);
    border-radius: 0.75rem;
  }

  .delete {
    margin-right: auto;
    color: var(--danger);
  }
</style>
