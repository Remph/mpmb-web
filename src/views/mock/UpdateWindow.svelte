<!--
  MOCK-UP (M11, not for merging): the window that says what MPMB's import changed when a character moved to
  a new sheet version. Made-up data from the SRD paladin imported into a blank sheet.
-->
<script lang="ts">
  import Modal from '../../popups/Modal.svelte';

  interface Props {
    onclose: () => void;
  }
  let { onclose }: Props = $props();
  let mpmbOpen = $state(false);

  const changes = [
    { part: 'Combat', what: 'Limited features', before: 'Lay on Hands, Channel Divinity, Magical Cunning, Breath Weapon, Draconic Flight', now: 'Breath Weapon, Draconic Flight, Lay on Hands, Channel Divinity, Magical Cunning' },
    { part: 'Combat', what: 'Bonus actions', before: 'Lay on Hands, Divine Sense, Draconic Flight', now: 'Draconic Flight, Lay on Hands, Divine Sense' },
    { part: 'Combat', what: 'Weapon 1 weight', before: '3 kg', now: '1.5 kg' },
    { part: 'Spells', what: 'Prepared marks (page 1)', before: '7 spells marked', now: 'none' },
    { part: 'Notes', what: 'Notes (sheet page 3)', before: 'Test Notes', now: '(empty)' },
  ];
  const mpmbNotes = [
    "The 'Class Features' text is now solely what the automation added.",
    "The 'Notes' section on the 3rd page is now solely what the automation added.",
    'Attack and Ammunition attributes are now solely what the automation set.',
    'Magic and Misc AC bonuses are now solely what the automation set.',
    'Feat and Magic Item descriptions are now solely what the automation set.',
  ];
</script>

<Modal title="Updated to MPMB's sheet v24.3.0" onescape={onclose} closeLabel="Close" wide>
  <p class="lead">
    MPMB's own import moved Test Paladin from v24.2.0 to the new sheet. Things you changed by hand may not have come
    along. These 5 entries differ from before:
  </p>
  <table>
    <thead><tr><th>Entry</th><th>Before</th><th>Now</th></tr></thead>
    <tbody>
      {#each changes as c (c.what)}
        <tr>
          <th scope="row"><span class="part">{c.part}</span>{c.what}</th>
          <td>{c.before}</td>
          <td>{c.now}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button type="button" class="disclose" aria-expanded={mpmbOpen} onclick={() => (mpmbOpen = !mpmbOpen)}
    >{mpmbOpen ? '▾' : '▸'} MPMB's notes on the import (English)</button
  >
  {#if mpmbOpen}
    <ul class="mpmb">
      {#each mpmbNotes as n (n)}<li>{n}</li>{/each}
    </ul>
  {/if}
  <p class="muted">The version before the update is kept. "Undo" brings it back, on sheet v24.2.0.</p>
  {#snippet actions()}
    <button type="button" onclick={onclose}>Undo: back to v24.2.0</button>
    <button type="button" class="primary" onclick={onclose}>Keep the update</button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin-top: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.5rem 0.5rem 0.5rem 0;
    border-bottom: 1px solid var(--line);
  }
  thead th {
    color: var(--ink-muted);
    font-weight: 500;
    font-size: 0.875rem;
  }
  tbody th {
    font-weight: 600;
    width: 30%;
  }
  .part {
    display: block;
    color: var(--ink-muted);
    font-weight: 400;
    font-size: 0.8125rem;
  }
  .disclose {
    border: none;
    background: none;
    padding-left: 0;
    color: var(--accent);
  }
  .mpmb {
    margin: 0.25rem 0 0.75rem;
    color: var(--ink-muted);
  }
  .muted {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }
</style>
