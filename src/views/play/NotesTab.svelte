<!--
  The Notes tab: the session notes in the sheet's notes field (Extra.Notes, page 3 of the PDF), and the
  sheet's extra notes pages (M6.5), one named tab each. A page shows its two columns as MPMB's text with
  its marks; Edit gives its title and columns as fields. Pages are added and removed with MPMB's own menu
  on the page's button, so MPMB asks before it deletes one, as in Acrobat. Fields are saved when they
  lose focus, so typing doesn't run MPMB's scripts on every key.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import {
    ADD_PAGE,
    DEFAULT_NOTES_TITLE,
    REMOVE_PAGE,
    addPageButton,
    notesFields,
    readNotesPages,
  } from '../../play/notes.ts';
  import type { NotesPage } from '../../play/notes.ts';
  import { valueOf } from '../../play/read.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import RichText from './RichText.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    /** Clicks a button and answers its menu (MPMB's page menu). */
    pick: (field: string, answer: string) => Promise<void>;
    t: Texts;
  }

  let { fields, disabled, change, pick, t }: Props = $props();
  const FIELD = 'Extra.Notes';
  /** The main notes field's tab. */
  const MAIN = '';
  const stored = $derived(valueOf(fields, FIELD).replace(/\r/g, '\n'));
  const pages = $derived(readNotesPages(fields));

  /** The open tab: MAIN or a page's prefix. */
  let on = $state(MAIN);
  let editing = $state(false);
  const page = $derived(pages.filter((p) => p.prefix === on)[0] ?? null);
  // A page removed (here or by MPMB) leaves its tab: back to the main notes.
  $effect(() => {
    if (on !== MAIN && !page) {
      on = MAIN;
      editing = false;
    }
  });

  const titleOf = (p: NotesPage, i: number): string =>
    p.title && p.title !== DEFAULT_NOTES_TITLE ? p.title : fill(t.notesPageDefault, { n: i + 1 });
  /** MPMB's fields keep "\r" between lines; a textarea gives "\n". */
  const lines = (text: string): string => text.replace(/\r\n?/g, '\n');

  function save(field: string, before: string, event: Event) {
    const text = (event.currentTarget as HTMLTextAreaElement | HTMLInputElement).value;
    if (text.trim() !== lines(before).trim()) change([{ edit: field, text }]);
  }

  /** An empty title goes back to MPMB's own. */
  function saveTitle(p: NotesPage, event: Event) {
    const text = (event.currentTarget as HTMLInputElement).value.trim() || DEFAULT_NOTES_TITLE;
    if (text !== p.title) change([{ edit: notesFields(p.prefix).title, text }]);
  }

  async function addPage() {
    const before = pages.map((p) => p.prefix);
    await pick(addPageButton(pages), ADD_PAGE);
    const added = pages.filter((p) => !before.includes(p.prefix))[0];
    if (added) {
      on = added.prefix;
      editing = true;
    }
  }

  async function removePage(p: NotesPage) {
    editing = false;
    await pick(notesFields(p.prefix).menu, REMOVE_PAGE);
  }

  const select = (prefix: string) => {
    on = prefix;
    editing = false;
  };
</script>

<div class="pagetabs" role="group" aria-label={t.notesPages}>
  <button type="button" aria-pressed={on === MAIN} onclick={() => select(MAIN)}>{t.notes}</button>
  {#each pages as p, i (p.prefix)}
    <button type="button" aria-pressed={on === p.prefix} onclick={() => select(p.prefix)}>{titleOf(p, i)}</button>
  {/each}
  <button type="button" class="add" {disabled} onclick={addPage}>+ {t.notesAddPage}</button>
</div>

{#if page}
  {@const i = pages.indexOf(page)}
  {@const f = notesFields(page.prefix)}
  <section class="panel" aria-labelledby="page-title">
    <header>
      <h2 id="page-title">{titleOf(page, i)}</h2>
      {#if editing}
        <button type="button" class="primary" onclick={() => (editing = false)}>{t.notesDone}</button>
      {:else}
        <button type="button" {disabled} onclick={() => (editing = true)}>{t.notesEdit}</button>
        <button type="button" class="quiet danger" {disabled} onclick={() => removePage(page)}
          >{t.notesRemovePage}</button
        >
      {/if}
    </header>
    {#if editing}
      <p class="hint">{t.notesMarks}</p>
      <label for="page-title-field">{t.notesPageTitle}</label>
      <input
        id="page-title-field"
        type="text"
        value={page.title === DEFAULT_NOTES_TITLE ? '' : page.title}
        placeholder={titleOf(page, i)}
        {disabled}
        onchange={(e) => saveTitle(page, e)}
      />
      <div class="columns">
        <div>
          <label for="page-left">{t.notesLeft}</label>
          <textarea
            id="page-left"
            rows="14"
            value={lines(page.left)}
            {disabled}
            onchange={(e) => save(f.left, page.left, e)}></textarea>
        </div>
        <div>
          <label for="page-right">{t.notesRight}</label>
          <textarea
            id="page-right"
            rows="14"
            value={lines(page.right)}
            {disabled}
            onchange={(e) => save(f.right, page.right, e)}></textarea>
        </div>
      </div>
    {:else}
      <p class="hint">{t.notesPageLine}</p>
      {#if page.left.trim() || page.right.trim()}
        <div class="columns text">
          {#if page.left.trim()}<div class="col"><RichText text={page.left} gaps /></div>{/if}
          {#if page.right.trim()}<div class="col"><RichText text={page.right} gaps /></div>{/if}
        </div>
      {:else}
        <p class="hint">{t.notesEmptyPage}</p>
      {/if}
    {/if}
  </section>
{:else}
  <section class="panel">
    <label for="notes">{t.notes}</label>
    <p class="hint">{t.notesHint}</p>
    <textarea id="notes" rows="16" value={stored} {disabled} onchange={(e) => save(FIELD, stored, e)}></textarea>
  </section>
{/if}

<style>
  .pagetabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.625rem;
  }

  .pagetabs button {
    min-height: 44px;
    padding: 0 0.875rem;
    border-radius: 999px;
    font-weight: 600;
  }

  .pagetabs button[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .pagetabs .add {
    border-style: dashed;
    color: var(--accent);
  }

  .panel {
    container-type: inline-size;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  h2 {
    flex: 1;
    min-width: 10rem;
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .danger {
    color: var(--danger);
  }

  label {
    display: block;
    font-weight: 800;
  }

  .columns label {
    margin-top: 0.5rem;
    font-weight: 700;
  }

  .hint {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  input,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  input {
    min-height: 44px;
  }

  textarea {
    resize: vertical;
  }

  /* The page's two columns side by side where there is room, as on the sheet. */
  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 0 1rem;
  }

  .text {
    font-size: 0.9375rem;
    line-height: 1.45;
  }

  /* The divider follows the grid: a line above the second column while they stack, and beside it once
     the panel has room for two (2 × 18rem and the gap, the grid's own break, not the window's: the
     middle column narrows when the play view gets its third column). */
  .col + .col {
    padding-top: 0.5rem;
    border-top: 1px dashed var(--line);
  }

  @container (min-width: 37rem) {
    .col + .col {
      padding: 0 0 0 1rem;
      border-top: 0;
      border-left: 1px dashed var(--line);
    }
  }
</style>
