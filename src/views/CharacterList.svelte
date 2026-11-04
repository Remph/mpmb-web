<!-- The start page: the characters in this browser, importing PDFs, backups. -->
<script lang="ts">
  import { SHEET_ID } from '../engine/sheet-id.ts';
  import type { Texts } from '../i18n.ts';
  import { counted, fill } from '../i18n.ts';
  import { MPMB_DOWNLOAD, MPMB_PATREON } from '../mpmb-links.ts';
  import { SAFE_PICTURE } from '../play/pictures.ts';
  import type { Session } from '../session.svelte.ts';
  import { dueForBackup, isSafari } from '../store/backup-reminder.ts';
  import Notes from './Notes.svelte';

  interface Props {
    session: Session;
    t: Texts;
    lang: string;
  }

  let { session, t, lang }: Props = $props();
  let pdfInput: HTMLInputElement | undefined = $state();
  let backupInput: HTMLInputElement | undefined = $state();
  const importing = $derived(session.notes.some((n) => n.kind === 'busy'));

  /** More names than this, and the reminder gives a count instead. */
  const MAX_NAMES = 3;
  /** The characters with changes no backup holds yet (finding 1 of the tech review; Nick's pick A). */
  const due = $derived(dueForBackup(session.characters));
  const dueText = $derived.by(() => {
    if (due.length > MAX_NAMES) return fill(t.backupDueCount, { count: due.length });
    const names = new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(
      due.map((meta) => meta.name || t.unnamed),
    );
    return fill(due.length === 1 ? t.backupDueNamesOne : t.backupDueNames, { names });
  });
  const safari = isSafari(navigator.userAgent);

  const changed = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });

  async function pickedPdfs(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    // Cleared, so that picking the same file again imports it again.
    input.value = '';
    if (files.length) await session.importPdfs(files);
  }

  let creating = $state(false);

  /** A blank character, straight onto its Build screen (M6). */
  async function newCharacter() {
    creating = true;
    try {
      const id = await session.create();
      if (id) location.hash = `#/character/${encodeURIComponent(id)}/build`;
    } finally {
      creating = false;
    }
  }

  async function pickedBackup(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) await session.restore(file);
  }
</script>

<section class="head">
  <h1>{t.charactersTitle}</h1>
  <div class="row">
    <!-- MPMB's condition for this site: point people to the official sheet (see mpmb-links.ts). -->
    <a class="button" href={MPMB_DOWNLOAD} target="_blank" rel="noopener" aria-label={t.getPdfLabel}>
      {t.getPdf}
    </a>
    <button type="button" disabled={importing || creating} onclick={newCharacter}>{t.newCharacter}</button>
    <button type="button" class="primary" disabled={importing} onclick={() => pdfInput?.click()}>
      {t.importPdf}
    </button>
  </div>
  <input
    bind:this={pdfInput}
    type="file"
    accept=".pdf,application/pdf"
    multiple
    hidden
    onchange={(e) => pickedPdfs(e.currentTarget)}
  />
</section>
<p class="hint">
  {fill(t.importHint, { version: SHEET_ID.version })}
  {t.getPdfFrom} <a href={MPMB_PATREON} target="_blank" rel="noopener">{t.mpmbPatreon}</a>.
</p>

<Notes notes={session.notes} />

{#if !session.client.answersPopUps}
  <!-- Without the page's isolation headers MPMB's questions can't wait for an answer (tech review
       finding 7): said here too, so a check on a new device (the iPad) sees it at once. -->
  <p class="warning">{t.notIsolated}</p>
{/if}

{#if due.length}
  <div class="reminder" role="status">
    <span class="icon" aria-hidden="true">⤓</span>
    <p><strong>{dueText}</strong> {t.backupDueWhy}{safari ? ` ${t.backupDueSafari}` : ''}</p>
    <button type="button" class="primary" onclick={() => session.backUp()}>{t.backUpAll}</button>
  </div>
{/if}

{#if session.storageError}
  <Notes notes={[{ id: 0, kind: 'error', text: fill(t.storageFailed, { reason: session.storageError }) }]} />
{/if}

{#if session.characters.length}
  <ul class="characters">
    {#each session.characters as character (character.id)}
      {@const addOns = character.addOns.files.length + Number(character.addOns.manual)}
      {@const portrait = character.portrait && SAFE_PICTURE.test(character.portrait) ? character.portrait : ''}
      <li>
        <a class="card" class:pictured={portrait} href={`#/character/${character.id}`}>
          {#if portrait}<img class="thumb" src={portrait} alt="" />{/if}
          <span class="name">{character.name || t.unnamed}</span>
          <span class="line">{[character.classes, character.species].filter(Boolean).join(' · ')}</span>
          <span class="line muted">
            {fill(t.changedOn, { date: changed(character.updated) })}{addOns
              ? ` · ${counted(t.addOnCountOne, t.addOnCount, addOns)}`
              : ''}
          </span>
          {#if character.sheetUpdate && !character.sheetUpdate.seen}
            <span class="line updated">↻ {fill(t.updListMark, { to: character.sheetUpdate.to })}</span>
          {/if}
        </a>
        <div class="actions">
          <button type="button" onclick={() => session.backUp([character.id])}>{t.backUp}</button>
          <button type="button" class="quiet" onclick={() => session.remove(character)}>{t.delete}</button>
        </div>
      </li>
    {/each}
  </ul>
{:else if !importing}
  <p class="empty">{t.noCharacters}</p>
{/if}

<section class="backups">
  <p class="hint">{t.storedHere}</p>
  <div class="row">
    <button type="button" disabled={!session.characters.length} onclick={() => session.backUp()}>
      {t.backUpAll}
    </button>
    <button type="button" onclick={() => backupInput?.click()}>{t.restore}</button>
    <input
      bind:this={backupInput}
      type="file"
      accept=".json,application/json"
      hidden
      onchange={(e) => pickedBackup(e.currentTarget)}
    />
  </div>
</section>

<style>
  .warning {
    margin: 0 0 1.25rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
  }

  /* Like the update line in the play view: something to do, not a failure. */
  .reminder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin: 0 0 1.25rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--accent);
    border-radius: 0.5rem;
    background: var(--accent-soft);
  }

  .reminder .icon {
    font-weight: 700;
    color: var(--accent);
  }

  .reminder p {
    flex: 1;
    min-width: min(14rem, 100%);
    margin: 0;
  }

  .updated {
    color: var(--accent);
    font-weight: 500;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    line-height: 1.1;
  }

  .hint {
    color: var(--ink-muted);
    margin: 0.5rem 0 1.25rem;
  }

  .hint a {
    color: var(--accent);
    /* Inline padding leaves the lines where they are but makes the link a 44 px touch target. */
    padding-block: 0.75rem;
  }

  /* A link that looks like the other buttons: it leaves the app, so it's no <button>. */
  .button {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    text-decoration: none;
  }

  .button:hover {
    background: var(--hover);
  }

  .characters {
    list-style: none;
    margin: 0 0 2rem;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
    gap: 0.75rem;
  }

  .characters li {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    overflow: hidden;
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.875rem 1rem 0.5rem;
    color: inherit;
    text-decoration: none;
    flex: 1;
  }

  /* With a portrait: the small picture on the left, the three lines beside it (M8). */
  .card.pictured {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    column-gap: 0.875rem;
    align-content: start;
  }

  .card.pictured > :not(.thumb) {
    grid-column: 2;
  }

  .thumb {
    grid-row: 1 / span 3;
    width: 4.5rem;
    max-width: 100%;
    aspect-ratio: 4 / 5;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    object-fit: cover;
  }

  .card:hover .name,
  .card:focus-visible .name {
    text-decoration: underline;
  }

  .name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--accent);
  }

  .muted {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    padding: 0.25rem 1rem 0.875rem;
  }

  .empty {
    margin: 1.5rem 0 2rem;
    padding: 1.5rem;
    border: 1px dashed var(--line);
    border-radius: 0.75rem;
    text-align: center;
    color: var(--ink-muted);
  }

  .backups {
    border-top: 1px solid var(--line);
    padding-top: 1rem;
  }

  .backups .hint {
    margin-top: 0;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
