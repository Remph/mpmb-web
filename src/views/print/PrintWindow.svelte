<!--
  "Print" from the sheet menu (M10): which parts go on paper and whether what changes in play is left blank
  for a pencil. "Print" hands over to the browser's own print dialog, where the player picks the printer,
  A4 and "Save as PDF".
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { PrintPart } from './PrintSheet.svelte';

  interface Props {
    /** The parts this character has something for (no Spells part for a fighter). */
    available: PrintPart[];
    parts: PrintPart[];
    blank: boolean;
    onprint: (parts: PrintPart[], blank: boolean) => void;
    onclose: () => void;
    t: Texts;
  }

  let { available, parts: start, blank: startBlank, onprint, onclose, t }: Props = $props();
  // The window's own copy: closing without printing changes nothing.
  // svelte-ignore state_referenced_locally
  let picked = $state<PrintPart[]>(start.filter((part) => available.includes(part)));
  // svelte-ignore state_referenced_locally
  let blank = $state(startBlank);

  const LABELS = $derived<Record<PrintPart, [string, string]>>({
    main: [t.printMain, t.printMainLine],
    features: [t.features, t.printFeaturesLine],
    spells: [t.spells, t.printSpellsLine],
    inventory: [t.tabInventory, t.printInventoryLine],
    profile: [t.tabProfile, t.printProfileLine],
    notes: [t.notes, t.printNotesLine],
  });

  function toggle(part: PrintPart) {
    picked = picked.includes(part) ? picked.filter((p) => p !== part) : available.filter((p) => p === part || picked.includes(p));
  }
</script>

<Modal title={t.printTitle} onescape={onclose} closeLabel={t.close}>
  <p class="intro">{t.printIntro}</p>
  <fieldset>
    <legend>{t.printParts}</legend>
    {#each available as part (part)}
      <label class="row">
        <input type="checkbox" checked={picked.includes(part)} onchange={() => toggle(part)} />
        <span>{LABELS[part][0]}<small>{LABELS[part][1]}</small></span>
      </label>
    {/each}
  </fieldset>
  <label class="row pencil">
    <input type="checkbox" bind:checked={blank} />
    <span>{t.printBlank}<small>{t.printBlankLine}</small></span>
  </label>

  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" disabled={!picked.length} onclick={() => onprint(picked, blank)}
      >{t.printButton}</button
    >
  {/snippet}
</Modal>

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  fieldset {
    margin: 0 0 0.75rem;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.25rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    min-height: 2.75rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
  }

  .row input {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    accent-color: var(--accent);
  }

  .row span {
    display: flex;
    flex-direction: column;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .pencil {
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }
</style>
