<!--
  The "Add-on scripts" window (M9, Remph picked it 2026-11-03): the character's script files with what each
  adds, a newer version or removal per file, new files from the computer or from the other characters in
  this browser, and the pasted code. Nothing changes until Apply, which hands everything to MPMB's own
  files dialog (the worker answers it in the player's place); MPMB then runs the scripts, says how it went
  and opens its Source Selection, as in Acrobat.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { addedOn, fileTitle, sameScript, scriptAdds, scriptName } from '../../build/add-ons.ts';
  import type { AddKind } from '../../build/add-ons.ts';
  import type { ScriptChanges } from '../../engine/add-ons.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { Texts, UiKey } from '../../i18n.ts';
  import { MPMB_SCRIPT_INDEX } from '../../mpmb-links.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { OpenCharacter, OtherScript, Session } from '../../session.svelte.ts';

  interface Props {
    session: Session;
    open: OpenCharacter;
    onclose: () => void;
    t: Texts;
  }

  let { session, open, onclose, t }: Props = $props();

  /** A file picked in this window: where it came from (its name on the computer, or the other character) and its code. */
  interface Picked {
    name: string;
    text: string;
  }

  /** A file the sheet has, and what the player chose for it here. */
  interface Row {
    key: string;
    text: string;
    removed: boolean;
    newer: Picked | null;
  }

  let rows: Row[] = $state([]);
  let added: Picked[] = $state([]);
  let manual = $state('');
  let others: OtherScript[] = $state([]);
  let loaded = $state(false);
  /** The names of files that couldn't be read, for the line under the buttons. */
  let unreadable: string[] = $state([]);

  const busy = $derived(open.status === 'opening' || open.status === 'working');
  /** Removals first: a newer version replaces the old one without MPMB asking to overwrite it. */
  const changes: ScriptChanges = $derived({
    remove: rows.filter((row) => row.removed || row.newer).map((row) => row.key),
    add: [
      ...rows.flatMap((row) => (row.newer && !row.removed ? [row.newer.text] : [])),
      ...added.map((file) => file.text),
    ],
  });
  const changed = $derived(changes.remove.length + changes.add.length > 0);
  /** Scripts of the other characters that this one doesn't have (or get) yet. */
  const offered = $derived(
    others.filter(
      (other) =>
        !rows.some((row) => !row.removed && sameScript(row.newer?.text ?? row.text, other.text)) &&
        !added.some((file) => sameScript(file.text, other.text)),
    ),
  );
  const manualLines = $derived(manual.trim() ? manual.trim().split('\n').length : 0);

  const KIND_TEXTS: Record<AddKind, [UiKey, UiKey]> = {
    classes: ['addsClassesOne', 'addsClasses'],
    subclasses: ['addsSubclassesOne', 'addsSubclasses'],
    species: ['addsSpeciesOne', 'addsSpecies'],
    backgrounds: ['addsBackgroundsOne', 'addsBackgrounds'],
    feats: ['addsFeatsOne', 'addsFeats'],
    spells: ['addsSpellsOne', 'addsSpells'],
    items: ['addsItemsOne', 'addsItems'],
    weapons: ['addsWeaponsOne', 'addsWeapons'],
    armour: ['addsArmourOne', 'addsArmour'],
    creatures: ['addsCreaturesOne', 'addsCreatures'],
  };

  /** "1 class", "12 spells": what the script plainly defines (see scriptAdds). */
  const addsOf = (text: string): string[] =>
    (Object.entries(scriptAdds(text)) as [AddKind, number][]).map(([kind, count]) =>
      counted(t[KIND_TEXTS[kind][0]], t[KIND_TEXTS[kind][1]], count),
    );

  const BYTES_PER_KB = 1024;
  /** Size in KB as the file has it (UTF-8), at least 1. */
  const sizeOf = (text: string): number => Math.max(1, Math.round(new Blob([text]).size / BYTES_PER_KB));
  const title = (text: string, fallback: string): string => scriptName(text) ?? fallback;
  const day = (date: string): string =>
    new Date(`${date}T12:00:00`).toLocaleDateString(t.locale, { day: 'numeric', month: 'short', year: 'numeric' });

  function subtitle(row: Row): string {
    const date = addedOn(row.key);
    const size = sizeOf(row.text);
    return date ? fill(t.addOnsAddedOn, { date: day(date), size }) : fill(t.addOnsSize, { size });
  }

  onMount(async () => {
    // The open character's scripts and the others' separately: a failed read of the others still shows
    // this character's (session.otherScripts already skips a character it can't read).
    try {
      const [files, theirs] = await Promise.all([session.scriptFiles(), session.otherScripts().catch(() => [])]);
      rows = (files?.files ?? []).map((file) => ({ ...file, removed: false, newer: null }));
      manual = files?.manual ?? '';
      others = theirs;
    } finally {
      // Never stuck on "Reading the scripts …": what was read shows, and files can still be added.
      loaded = true;
    }
  });

  /**
   * A new file: a newer version of a script the sheet has replaces it, a second pick of a script picked
   * here replaces that pick, anything else is added. As in MPMB, scripts are matched by their iFileName.
   */
  function take(file: Picked) {
    const row = rows.find((one) => !one.removed && sameScript(one.text, file.text));
    if (row) {
      row.newer = file;
      return;
    }
    const index = added.findIndex((one) => sameScript(one.text, file.text));
    if (index >= 0) added[index] = file;
    else added.push(file);
  }

  /** The text of the picked files, in the order picked; a file that can't be read is named under the buttons. */
  async function read(input: HTMLInputElement): Promise<Picked[]> {
    const files = Array.from(input.files ?? []);
    // The same file can be picked again later (after an Undo).
    input.value = '';
    unreadable = [];
    const texts = await Promise.all(
      files.map(async (file) => {
        try {
          return { name: file.name, text: await file.text() };
        } catch {
          unreadable.push(file.name);
          return null;
        }
      }),
    );
    return texts.filter((file): file is Picked => file !== null);
  }

  async function addFiles(event: Event) {
    (await read(event.currentTarget as HTMLInputElement)).forEach(take);
  }

  async function newerVersion(row: Row, event: Event) {
    const [file] = await read(event.currentTarget as HTMLInputElement);
    if (!file) return;
    row.newer = file;
    row.removed = false;
  }

  function apply() {
    const wanted = $state.snapshot(changes);
    onclose();
    void session.setScripts(wanted);
  }

  /** MPMB's own dialog for pasted code; the player edits or empties it there. */
  function paste() {
    onclose();
    void session.pasteScript();
  }
</script>

<Modal title={t.addOnsTitle} onescape={onclose} closeLabel={t.close} wide>
  <p class="intro">{t.addOnsIntro}</p>

  {#if !loaded}
    <p class="muted">{t.addOnsReading}</p>
  {:else}
    <ul class="files">
      {#each rows as row (row.key)}
        <li class="file" class:gone={row.removed} class:new={row.newer && !row.removed}>
          <span class="icon" aria-hidden="true">JS</span>
          <div class="name">
            <b>{title(row.newer?.text ?? row.text, fileTitle(row.key))}</b>
            {#if row.removed}
              <span class="tag">{t.addOnsGone}</span>
            {:else if row.newer}
              <span class="tag">{t.addOnsNewer}</span>
            {/if}
            <small
              >{row.newer
                ? `${row.newer.name} · ${fill(t.addOnsPicked, { size: sizeOf(row.newer.text) })}`
                : subtitle(row)}</small
            >
            <span class="adds">
              {#each addsOf(row.newer?.text ?? row.text) as line (line)}<span>{line}</span>{/each}
            </span>
          </div>
          <div class="acts">
            {#if row.removed || row.newer}
              <button
                type="button"
                onclick={() => {
                  row.removed = false;
                  row.newer = null;
                }}>{t.addOnsUndo}</button
              >
            {:else}
              <label class="button">
                <input type="file" disabled={busy} onchange={(event) => newerVersion(row, event)} />
                {t.addOnsPickNewer}
              </label>
              <button type="button" onclick={() => (row.removed = true)}>{t.addOnsRemove}</button>
            {/if}
          </div>
        </li>
      {/each}
      {#each added as file, index (index)}
        <li class="file new">
          <span class="icon" aria-hidden="true">JS</span>
          <div class="name">
            <b>{title(file.text, file.name)}</b>
            <span class="tag">{t.addOnsNew}</span>
            <small>{file.name} · {fill(t.addOnsPicked, { size: sizeOf(file.text) })}</small>
            <span class="adds">
              {#each addsOf(file.text) as line (line)}<span>{line}</span>{/each}
            </span>
          </div>
          <div class="acts">
            <button type="button" onclick={() => added.splice(index, 1)}>{t.addOnsUndo}</button>
          </div>
        </li>
      {/each}
      {#if manualLines}
        <li class="file">
          <span class="icon" aria-hidden="true">{'{ }'}</span>
          <div class="name">
            <b>{t.addOnsPasted}</b>
            <small>{counted(t.addOnsPastedLineOne, t.addOnsPastedLine, manualLines)}</small>
          </div>
          <div class="acts">
            <button type="button" disabled={busy || changed} onclick={paste}>{t.addOnsEdit}</button>
          </div>
        </li>
      {/if}
      {#if rows.length === 0 && added.length === 0 && !manualLines}
        <li class="file empty">{t.addOnsEmpty}</li>
      {/if}
    </ul>

    <div class="add">
      <!-- In its label, so a tap opens the picker straight from the player's tap (Safari needs that). -->
      <label class="button main">
        <input type="file" multiple disabled={busy} onchange={addFiles} />
        {t.addOnsAddFile}
      </label>
      {#if !manualLines}
        <button type="button" disabled={busy || changed} onclick={paste}>{t.addOnsPaste}</button>
      {/if}
    </div>
    {#if unreadable.length}
      <p class="failed" role="alert">
        {unreadable.map((name) => fill(t.addOnsUnreadable, { name })).join(' ')}
      </p>
    {/if}
    <p class="muted">{changed ? t.addOnsPasteLater : t.addOnsAddHint}</p>

    {#if offered.length}
      <h3>{t.addOnsOthers}</h3>
      <ul class="files">
        {#each offered as other (other.owner + other.key)}
          <li class="file">
            <span class="icon" aria-hidden="true">JS</span>
            <div class="name">
              <b>{title(other.text, fileTitle(other.key))}</b>
              <small>{fill(t.addOnsIn, { name: other.owner, size: sizeOf(other.text) })}</small>
              <span class="adds">
                {#each addsOf(other.text) as line (line)}<span>{line}</span>{/each}
              </span>
            </div>
            <div class="acts">
              <button
                type="button"
                onclick={() => take({ name: fill(t.addOnsFrom, { name: other.owner }), text: other.text })}
                >{t.addOnsAddHere}</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <p><a class="external" href={MPMB_SCRIPT_INDEX} target="_blank" rel="noopener noreferrer">{t.addOnsFind} ↗</a></p>
  {/if}

  {#snippet actions()}
    <small class="muted line">{t.addOnsApplyLine}</small>
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" disabled={!changed || busy} onclick={apply}>{t.apply}</button>
  {/snippet}
</Modal>

<style>
  .intro {
    margin: 0 0 0.75rem;
  }

  .muted {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  h3 {
    margin: 1.25rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .files {
    margin: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    list-style: none;
  }

  .file {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.625rem 0.875rem;
    border-top: 1px solid var(--line);
  }

  .file:first-child {
    border-top: 0;
    border-radius: 0.75rem 0.75rem 0 0;
  }

  .file:last-child {
    border-radius: 0 0 0.75rem 0.75rem;
  }

  .file:only-child {
    border-radius: 0.75rem;
  }

  .file.empty {
    min-height: 52px;
    color: var(--ink-muted);
  }

  .file.new {
    background: var(--temp-soft);
  }

  .file.gone b,
  .file.gone small,
  .file.gone .adds {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 700;
  }

  .name {
    flex: 1 1 14rem;
    min-width: 0;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .name small {
    display: block;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .tag {
    display: inline-block;
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--temp);
    border-radius: 99px;
    color: var(--temp);
    font-size: 0.75rem;
    vertical-align: 1px;
  }

  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .adds:empty {
    display: none;
  }

  .adds span {
    padding: 1px 7px;
    border-radius: 99px;
    background: var(--hover);
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-left: auto;
  }

  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  /* A file picker that looks and sizes like the app's buttons. */
  .button {
    display: inline-flex;
    position: relative;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }

  .button:not(:has(input:disabled)):hover {
    background: var(--hover);
  }

  .button:focus-within {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .button.main {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .button:has(input:disabled) {
    opacity: 0.55;
    cursor: default;
  }

  /* Hidden but still focusable and reachable for screen readers; the label is what people tap. */
  .button input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .failed {
    margin: 0.5rem 0 0;
    color: var(--danger);
  }

  .external {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 600;
  }

  .line {
    flex: 1 1 16rem;
    margin: 0;
  }
</style>
