<!--
  What MPMB's import changed when the character moved to a new sheet version (M11): each entry before and now,
  MPMB's own notes folded away, and the choice to keep the update or go back to the copy from before.
-->
<script lang="ts">
  import Modal from '../../popups/Modal.svelte';
  import type { Texts } from '../../i18n.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { PreviousVersion, SheetUpdate } from '../../store/characters.ts';
  import { changeLabel } from './labels.ts';
  import { mpmbNotes } from './mpmb-notes.ts';

  interface Props {
    update: SheetUpdate;
    name: string;
    /** The copy from before with the list of changes; null when this device doesn't have it (a backup). */
    details: PreviousVersion | null;
    t: Texts;
    onkeep: () => void;
    onundo: () => void;
  }
  let { update, name, details, t, onkeep, onundo }: Props = $props();
  let mpmbOpen = $state(false);

  /** More rows than fit a window: the rest is counted. An update normally changes a handful. */
  const MAX_ROWS = 60;
  const changes = $derived(details?.changes ?? []);
  const rows = $derived(changes.slice(0, MAX_ROWS));
  const notes = $derived(mpmbNotes(details?.summary ?? ''));
  /** Long texts (notes, class features) show their start; the sheet has the rest. */
  const CLIP = 300;
  const shown = (value: string): string =>
    value ? (value.length > CLIP ? `${value.slice(0, CLIP)} …` : value) : t.updEmpty;
</script>

<Modal title={fill(t.updTitle, { to: update.to })} onescape={onkeep} closeLabel={t.updKeep} wide>
  <p class="lead">{fill(t.updLead, { from: update.from, name })}</p>
  {#if !details}
    <p>{t.updNoDetails}</p>
  {:else if changes.length === 0}
    <p>{t.updNone}</p>
  {:else}
    <p>{counted(t.updListOne, t.updList, changes.length)}</p>
    <div class="scroll">
      <table>
        <thead><tr><th>{t.updEntry}</th><th>{t.updBefore}</th><th>{t.updNow}</th></tr></thead>
        <tbody>
          {#each rows as change (change.field)}
            <tr>
              <th scope="row">{changeLabel(change.field, t)}</th>
              <td class:empty={!change.before}>{shown(change.before)}</td>
              <td class:empty={!change.now}>{shown(change.now)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if changes.length > rows.length}<p class="muted">
        {fill(t.updMore, { count: changes.length - rows.length })}
      </p>{/if}
  {/if}
  {#if notes.length}
    <button type="button" class="disclose" aria-expanded={mpmbOpen} onclick={() => (mpmbOpen = !mpmbOpen)}
      >{mpmbOpen ? '▾' : '▸'} {t.updMpmbNotes}</button
    >
    {#if mpmbOpen}
      <div class="mpmb" lang="en">
        {#each notes as note, i (i)}
          {#if note.kind === 'heading'}<h3>{note.text}</h3>
          {:else}<p class:point={note.kind === 'point'}>{note.text}</p>{/if}
        {/each}
      </div>
    {/if}
  {/if}
  {#if details}<p class="muted">{fill(t.updKept, { from: update.from })}</p>{/if}
  {#snippet actions()}
    {#if details}<button type="button" onclick={onundo}>{fill(t.updUndo, { from: update.from })}</button>{/if}
    <button type="button" class="primary" onclick={onkeep}>{t.updKeep}</button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin-top: 0;
  }
  /* A long text (notes, class features) wraps; the table itself never makes the window scroll sideways. */
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0 0.75rem;
  }
  th,
  td {
    text-align: left;
    vertical-align: top;
    padding: 0.5rem 0.5rem 0.5rem 0;
    border-bottom: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
  td {
    white-space: pre-line;
  }
  thead th {
    color: var(--ink-muted);
    font-weight: 500;
    font-size: 0.875rem;
  }
  tbody th {
    font-weight: 600;
    width: 30%;
    /* Long German names ("Anwendungen") break at a syllable, with a hyphen, before any letter would do. The
       values are MPMB's English text, so they keep breaking only where they must. */
    hyphens: auto;
  }
  .empty {
    color: var(--ink-muted);
    font-style: italic;
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
  .mpmb h3 {
    font-size: 1rem;
    margin: 0.75rem 0 0.25rem;
    color: var(--ink);
  }
  .mpmb p {
    margin: 0.25rem 0;
  }
  /* MPMB's own bullet points, hanging like a list's. */
  .mpmb .point {
    padding-left: 1.25rem;
    text-indent: -0.75rem;
  }
  .mpmb .point::before {
    content: '• ';
  }
  .muted {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }
</style>
