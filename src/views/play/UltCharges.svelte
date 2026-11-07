<!--
  The ult charges card (homebrew, only while its switch is on): a meter that fills over a fight, one
  charge for each turn and each attack (the group's house rule). + is the big button because it is the
  one tapped every turn; − undoes a mistap. A full meter turns + into "Use ult", which empties it (Remph
  picked this over a plain − / +, 2026-11-04). Tapping the number types it, for jumps or fixes.
  Not a sheet field: the charges are saved with the character's list entry and never go into a PDF.
  Its window also says where the ult shows on the Combat tab's Actions card (as an action, bonus action or
  reaction tile, or not at all) and holds its description, folded (Remph picked this, 2026-11-07).
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { MAX_TEXT, ULT_KINDS, withCharges, withMax } from '../../homebrew/ult.ts';
  import type { UltCharges, UltKind } from '../../homebrew/ult.ts';
  import Modal from '../../popups/Modal.svelte';
  import NumberPad from './NumberPad.svelte';

  interface Props {
    ult: UltCharges;
    disabled: boolean;
    onchange: (ult: UltCharges) => void;
    t: Texts;
  }

  let { ult, disabled, onchange, t }: Props = $props();

  const full = $derived(ult.charges >= ult.max);
  const percent = $derived(`${Math.min(100, (ult.charges / ult.max) * 100)}%`);
  /**
   * "Use ult" takes the place of "+1 charge" under the same finger, so a quick double tap at one short of
   * full would fill the meter and empty it at once. The same the other way: a double tap on "Use ult" would
   * empty it and count the first charge again. So whichever button just took the other's place waits a
   * moment before it answers. Not when the card first shows with charges to go: nothing was swapped.
   */
  let armed = $state(true);
  let shown = false;
  $effect(() => {
    // `full` read first, on every run: the effect runs again only when what it read changes.
    const isFull = full;
    const swapped = shown || isFull;
    shown = true;
    if (!swapped) return;
    armed = false;
    const timer = setTimeout(() => (armed = true), 800);
    return () => clearTimeout(timer);
  });
  let typing = $state(false);
  let editing = $state(false);
  let name = $state('');
  let max = $state('');
  let kind: UltKind = $state('none');
  let text = $state('');
  /** The description's first line, for the folded box: the player sees what is there without opening it. */
  const preview = $derived(text.trim().split(/\r?\n/)[0] ?? '');

  function edit() {
    name = ult.name;
    max = String(ult.max);
    kind = ult.kind;
    text = ult.text;
    editing = true;
  }

  function save() {
    editing = false;
    const n = Number(max);
    const next = { ...ult, name: name.trim().slice(0, 60), kind, text: text.trim().slice(0, MAX_TEXT) };
    onchange(withMax(next, Number.isFinite(n) && n > 0 ? n : ult.max));
  }
</script>

<section class="ult" class:full aria-labelledby="ult-title">
  <div class="head">
    <!-- The ult's own name once the player gave it one: the meter says what it counts. -->
    <h2 id="ult-title">{ult.name || t.ultTitle}</h2>
    {#if full}<span class="ready">{t.ultReady}</span>{/if}
    <button type="button" class="edit" {disabled} onclick={edit}>{t.ultEdit}</button>
  </div>
  <div class="row">
    <button
      type="button"
      class="now"
      aria-label={fill(t.ultTypeLabel, { charges: ult.charges, max: ult.max })}
      {disabled}
      onclick={() => (typing = true)}
      ><b aria-live="polite">{ult.charges}</b><span class="max">/ {ult.max}</span></button
    >
    <span class="buttons">
      <button
        type="button"
        aria-label={t.ultLess}
        disabled={disabled || ult.charges <= 0}
        onclick={() => onchange(withCharges(ult, ult.charges - 1))}>−</button
      >
      {#if full}
        <button
          type="button"
          class="primary"
          disabled={disabled || !armed}
          onclick={() => onchange(withCharges(ult, 0))}>{t.ultUse}</button
        >
      {:else}
        <button
          type="button"
          class="primary"
          disabled={disabled || !armed}
          onclick={() => onchange(withCharges(ult, ult.charges + 1))}>{t.ultMore}</button
        >
      {/if}
    </span>
  </div>
  <div class="bar" aria-hidden="true"><i style:width={percent}></i></div>
</section>

{#if typing}
  <NumberPad
    title={t.ultTypeTitle}
    hint={fill(t.ultTypeHint, { max: ult.max })}
    applyLabel={t.apply}
    maxDigits={2}
    onapply={(n) => {
      typing = false;
      onchange(withCharges(ult, n));
    }}
    onclose={() => (typing = false)}
    {t}
  />
{/if}

{#if editing}
  <Modal title={t.ultEditTitle} onescape={() => (editing = false)} closeLabel={t.close}>
    <form
      id="ult-form"
      onsubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label
        >{t.ultName}
        <input type="text" maxlength="60" placeholder={t.ultNameHint} bind:value={name} /></label
      >
      <label
        >{t.ultMax}
        <input type="number" inputmode="numeric" min="1" max="99" required bind:value={max} /></label
      >
      <fieldset>
        <legend>{t.ultShowAs}</legend>
        <div class="kinds">
          {#each ULT_KINDS as k (k)}
            <button type="button" aria-pressed={kind === k} onclick={() => (kind = k)}>{t[`ultKind${k}`]}</button>
          {/each}
        </div>
      </fieldset>
      <!-- Folded: most edits change the name or the charges, and a long rule would push those out of sight. -->
      <details class="text">
        <summary><span class="label">{t.ultText}</span><span class="preview">{preview || t.ultTextEmpty}</span></summary
        >
        <textarea aria-label={t.ultText} rows="8" maxlength={MAX_TEXT} bind:value={text}></textarea>
      </details>
      <p class="hint">{t.ultTextHint} {t.ultEditHint}</p>
    </form>
    {#snippet actions()}
      <button type="button" onclick={() => (editing = false)}>{t.cancel}</button>
      <button type="submit" form="ult-form" class="primary">{t.apply}</button>
    {/snippet}
  </Modal>
{/if}

<style>
  .ult {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  /* Full: the card says so in the accent colour, so the player sees it from the corner of an eye. */
  .ult.full {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  /* A long name wraps rather than being cut: with "Ready" and the German "Ändern" beside it, it may need two lines. */
  h2 {
    min-width: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  /* A quiet text button: editing is rare, the meter is what is tapped. */
  .edit {
    flex: none;
    margin-left: auto;
    margin-block: -0.375rem;
    margin-right: -0.5rem;
    padding: 0 0.5rem;
    border-color: transparent;
    background: none;
    color: var(--accent);
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.5rem;
  }

  /* The number looks like a number; the dashed underline says it can be tapped (as in the steppers). */
  .now {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    padding: 0;
    border-color: transparent;
    background: none;
  }

  .now b {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--accent);
    text-decoration: underline dashed 1px;
    text-underline-offset: 0.25rem;
  }

  .max {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--ink-muted);
  }

  .ready {
    flex: none;
    padding: 0.125rem 0.625rem;
    border-radius: 1rem;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .bar {
    position: relative;
    height: 0.5rem;
    margin: 0.5rem 0 0.125rem;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    overflow: hidden;
  }

  .bar i {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 0.25rem;
    background: var(--accent);
  }

  /* Right-aligned next to the number; the meter is what moves, so it sits under both. */
  .buttons {
    display: flex;
    gap: 0.375rem;
    margin-left: auto;
  }

  .buttons button {
    padding: 0 0.875rem;
    font-size: 1.125rem;
  }

  .buttons .primary {
    min-width: 7rem;
    padding: 0 0.625rem;
    font-size: 1rem;
    font-weight: 700;
  }

  /* minmax(0, …): the folded description's one-line preview must not widen the window on a phone. */
  form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-weight: 600;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  /* Four even buttons, two by two (four across would squeeze "Bonusaktion"); the picked one filled. */
  .kinds {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.25rem;
  }

  .kinds button {
    padding: 0 0.5rem;
    font-weight: 600;
  }

  .kinds button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .text {
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.75rem;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::before {
    content: '▸';
    color: var(--accent);
  }

  .text[open] summary::before {
    content: '▾';
  }

  .label {
    flex: none;
    font-weight: 600;
  }

  /* One line of what is there; open, the box shows it all. */
  .preview {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text[open] .preview {
    display: none;
  }

  .text textarea {
    display: block;
    width: calc(100% - 1.5rem);
    margin: 0 0.75rem 0.75rem;
  }

  textarea {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 400;
    line-height: 1.4;
    resize: vertical;
  }

  input {
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
  }

  .hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }
</style>
