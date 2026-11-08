<!--
  The top of the left column while a Wild Shape form is shown (Remph picked A, 2026-11-08): which beast, the
  uses left, and the one main action: "Change into …" (spends a use, gives the Temp HP) or, in that form,
  "Leave form". The character's own hit points follow below it (Vitals), as the 2024 rules keep them.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { WildShapeForm, WildShapeRules, WildShapeUses } from '../../play/wild-shapes.ts';
  import Dots from './Dots.svelte';

  interface Props {
    form: WildShapeForm;
    /** Whether the character is in this form now. */
    inThis: boolean;
    uses: WildShapeUses | null;
    rules: WildShapeRules | null;
    disabled: boolean;
    onchange: () => void;
    onleave: () => void;
    onuses: (used: number) => void;
    onremove: () => void;
    onoptions: () => void;
    t: Texts;
  }

  let { form, inThis, uses, rules, disabled, onchange, onleave, onuses, onremove, onoptions, t }: Props = $props();

  /** "Wild Shape form · Medium Beast · CR 1/4" */
  const subtitle = $derived(
    [
      inThis ? t.formNow : t.formKind,
      [form.size, form.creatureType].filter(Boolean).join(' '),
      // A no-break space keeps "CR 1/4" on one line.
      form.challenge ? fill(t.formChallenge, { cr: form.challenge }).replace(' ', '\u00a0') : '',
    ]
      .filter(Boolean)
      .join(' · '),
  );
  const tempHp = $derived(Number(rules?.tempHp) || 0);
  const noUses = $derived(uses !== null && uses.left === 0);
  const note = $derived.by(() => {
    if (!uses) return '';
    const left = { left: uses.left, total: uses.total };
    return tempHp > 0 ? fill(t.formChangeNote, { ...left, temp: tempHp }) : fill(t.formChangeNoteNoTemp, left);
  });
</script>

<section class="panel who" class:in={inThis} aria-labelledby="form-name">
  <h2 id="form-name">{form.name}</h2>
  <p class="muted">{subtitle}</p>
  {#if uses}
    <div class="uses">
      <Dots total={uses.total} used={uses.total - uses.left} name={t.wildShape} {disabled} onchange={onuses} {t} />
      <span class="muted">{fill(t.formUses, { left: uses.left, total: uses.total })}</span>
    </div>
  {/if}
  {#if inThis}
    <button type="button" class="main" {disabled} onclick={onleave}>{t.formLeave}</button>
  {:else}
    <button type="button" class="main primary" disabled={disabled || noUses} onclick={onchange}
      >{fill(t.formChange, { name: form.name })}</button
    >
    <p class="note">
      {noUses ? t.formNoUses : note}
      {#if rules?.duration && !noUses}{fill(t.formDuration, { duration: rules.duration })}{/if}
    </p>
  {/if}
  <div class="more">
    <button type="button" {disabled} onclick={onremove}>{fill(t.formRemove, { name: form.name })}</button>
    <button type="button" {disabled} onclick={onoptions}>{t.formOptions}</button>
  </div>
</section>

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  /* In this form: the panel carries the accent, like the form's button in the bar. */
  .panel.in {
    border: 2px solid var(--accent);
  }

  h2 {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 800;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0.25rem 0 0;
  }

  .muted {
    color: var(--ink-muted);
  }

  .uses {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.5rem;
    margin-top: 0.25rem;
  }

  .main {
    width: 100%;
    margin-top: 0.625rem;
    font-weight: 700;
  }

  .main:not(.primary) {
    color: var(--accent);
  }

  .note {
    color: var(--ink-muted);
    font-size: 0.875rem;
    line-height: 1.35;
  }

  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.625rem;
  }

  .more button {
    flex: 1 1 auto;
    color: var(--ink-muted);
  }
</style>
