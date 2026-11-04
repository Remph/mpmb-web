<!--
  The play view (M4): the screen a player keeps open at the table. Three columns on a laptop: hit
  points and conditions left, abilities and skills right, and the middle switches between combat,
  inventory, features and notes. Narrower (the iPad in portrait), the right column becomes a tab.
  Every tap goes through MPMB's own fields (session.change), so rules and saving stay MPMB's.
-->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import { longRest, shortRest } from '../play/rules.ts';
  import type { RestEdits } from '../play/rules.ts';
  import { readOnly } from '../session.svelte.ts';
  import type { OpenCharacter, Session, Step } from '../session.svelte.ts';
  import Notes from './Notes.svelte';
  import Checks from './play/Checks.svelte';
  import CombatTab from './play/CombatTab.svelte';
  import FeaturesTab from './play/FeaturesTab.svelte';
  import InventoryTab from './play/InventoryTab.svelte';
  import NotesTab from './play/NotesTab.svelte';
  import ProfileTab from './play/ProfileTab.svelte';
  import SheetMenu from './play/SheetMenu.svelte';
  import SpellsTab from './play/SpellsTab.svelte';
  import TopBar from './TopBar.svelte';
  import { readSpells } from '../play/spells.ts';
  import Vitals from './play/Vitals.svelte';
  import CompanionBar from './play/CompanionBar.svelte';
  import CompanionChecks from './play/CompanionChecks.svelte';
  import CompanionTab from './play/CompanionTab.svelte';
  import CompanionVitals from './play/CompanionVitals.svelte';
  import {
    ADD_COMPANION_PAGE,
    ADD_FIRST_COMPANION_PAGE,
    addedPage,
    companionMenu,
    isEmptyCompanion,
    PAGES_LAYOUT_BOOKMARK,
    readCompanions,
    stillShown,
  } from '../play/companions.ts';
  import { homebrew } from '../homebrew/switches.svelte.ts';
  import { readUlt } from '../homebrew/ult.ts';
  import { valueOf } from '../play/read.ts';
  import { flushSync } from 'svelte';
  import PrintSheet from './print/PrintSheet.svelte';
  import { printableParts } from '../play/print.ts';
  import type { PrintPart } from '../play/print.ts';
  import PrintWindow from './print/PrintWindow.svelte';
  import FillPdfWindow from './print/FillPdfWindow.svelte';
  import UpdateLine from './update/UpdateLine.svelte';
  import UpdateWindow from './update/UpdateWindow.svelte';
  import type { PreviousVersion } from '../store/characters.ts';

  interface Props {
    session: Session;
    open: OpenCharacter;
    toggleLanguage: () => void;
    t: Texts;
  }

  let { session, open, toggleLanguage, t }: Props = $props();

  type Tab = 'combat' | 'spells' | 'checks' | 'inventory' | 'features' | 'profile' | 'notes';
  let tab = $state<Tab>('combat');
  let menuOpen = $state(false);
  let width = $state(0);
  /** From this width the checks have their own column; below it they are a tab. Matches the CSS. */
  const THREE_COLUMNS = 1100;
  const wide = $derived(width >= THREE_COLUMNS);
  const tabs = $derived(
    (
      [
        ['combat', t.tabCombat],
        ['spells', t.tabSpells],
        ['checks', t.tabChecks],
        ['inventory', t.tabInventory],
        ['features', t.tabFeatures],
        ['profile', t.tabProfile],
        ['notes', t.tabNotes],
      ] as const
    ).filter(([key]) => !(wide && key === 'checks') && !(key === 'spells' && !hasSpells)),
  );
  /** The Spells tab only for a character with spell sheet pages. */
  const hasSpells = $derived(readSpells(open.fields).length > 0);
  const shownTab = $derived((wide && tab === 'checks') || (tab === 'spells' && !hasSpells) ? 'combat' : tab);

  // Companion pages (Remph picked B, 2026-11-04): the bar under the top bar switches all three columns to a
  // companion. Which one is shown belongs to this view and this character; it isn't saved.
  const companions = $derived(readCompanions(open.fields));
  let showing = $state<{ id: string; prefix: string } | null>(null);
  const shownPrefix = $derived(
    showing?.id === open.meta.id
      ? stillShown(
          companions.map((c) => c.prefix),
          showing.prefix,
        )
      : null,
  );
  const companion = $derived(companions.find((c) => c.prefix === shownPrefix) ?? null);
  /** MPMB starts every sheet with an empty companion page: the bar lists empty pages only while one is shown. */
  const listed = $derived(companions.filter((c) => !isEmptyCompanion(c) || c.prefix === shownPrefix));
  type CompanionTabKey = 'combat' | 'checks' | 'notes';
  let companionTab = $state<CompanionTabKey>('combat');
  const companionTabs = $derived(
    (
      [
        ['combat', t.tabCombat],
        ['checks', t.tabChecks],
        ['notes', t.tabNotes],
      ] as const
    ).filter(([key]) => !(wide && key === 'checks')),
  );
  const shownCompanionTab = $derived(wide && companionTab === 'checks' ? 'combat' : companionTab);

  function showCompanion(prefix: string | null) {
    showing = prefix === null ? null : { id: open.meta.id, prefix };
    window.scrollTo({ top: 0 });
  }

  /**
   * "+ Companion": an empty page if the sheet has one (MPMB makes one with every new sheet), else MPMB's
   * "Add extra companion page" on the last page's menu (or MPMB's pages layout menu, with no page left).
   */
  async function addCompanion() {
    menuOpen = false;
    const empty = companions.find(isEmptyCompanion);
    if (empty) return showCompanion(empty.prefix);
    const before = companions.map((c) => c.prefix);
    const last = before[before.length - 1];
    await (last
      ? session.pick(companionMenu(last), ADD_COMPANION_PAGE)
      : session.pickBookmark(PAGES_LAYOUT_BOOKMARK, ADD_FIRST_COMPANION_PAGE));
    const added = addedPage(
      before,
      readCompanions(open.fields).map((c) => c.prefix),
    );
    if (added) showCompanion(added);
  }

  const fields = $derived(open.fields);
  const disabled = $derived(readOnly(open.status));
  /** Open in another tab before this one loaded its sheet (see store/tab-lock.ts). */
  const elsewhereOnly = $derived(open.status === 'elsewhere' && Object.keys(open.fields).length === 0);
  const change = (steps: Step[]) => void session.change(steps);
  /** The ult charges card only while its homebrew switch is on; the values stay with the character either way. */
  const ult = $derived(homebrew.switches.ultCharges ? readUlt(open.meta.homebrew?.ult) : null);
  /**
   * A new character before its class is chosen: MPMB's sheet has 0 hit points, death saves and empty scores,
   * which looked like a dying character. A card that leads to the Build screen takes the hit point box's
   * place, and the rests go, until a class is chosen (UI review 2, finding 06).
   */
  const noClass = $derived(open.status !== 'opening' && valueOf(fields, 'Class and Levels').trim() === '');
  const buildHref = $derived(`#/character/${encodeURIComponent(open.meta.id)}/build`);

  const restSteps = (edits: RestEdits): Step[] => [
    ...Object.entries(edits.values).map(([edit, text]) => ({ edit, text })),
    ...edits.untick.map((click) => ({ click })),
  ];

  /**
   * MPMB adds Pact Magic slots to the other slots of their level, so the boxes can't tell which ones a
   * short rest gives back; a warlock is told to do it by hand.
   */
  const shortRestText = (): string =>
    /warlock/i.test(open.meta.classes) ? `${t.shortRestText} ${t.shortRestPactMagic}` : t.shortRestText;

  // After a sheet update (M11): the line until the player keeps or undoes it; after an undo, the line that
  // offers the update again.
  const sheetUpdate = $derived(open.meta.sheetUpdate);
  const updateLine = $derived(sheetUpdate && (!sheetUpdate.seen || sheetUpdate.undone) ? sheetUpdate : null);
  /** The "What changed" window's contents once loaded; undefined while it is closed. */
  let updateDetails = $state<PreviousVersion | null | undefined>(undefined);
  async function showUpdate() {
    updateDetails = await session.updateDetails();
  }
  function keepUpdate() {
    updateDetails = undefined;
    void session.keepUpdate();
  }
  function undoUpdate() {
    updateDetails = undefined;
    void session.undoUpdate();
  }

  let printWindow = $state(false);
  let fillPdfWindow = $state(false);
  /** The parts and the pencil choice from the print window; null until it was used (Ctrl+P prints every part). */
  let printParts = $state<PrintPart[] | null>(null);
  let printBlank = $state(true);
  /** Only while the browser prints: the print sheet reads every part, too much to redo on each tap. */
  let printing = $state(false);
  /** Read only while the print window is open or the browser prints: it reads every part of the sheet. */
  const printable = $derived(printWindow || printing ? printableParts(open.fields) : []);

  function print(parts: PrintPart[], blank: boolean) {
    printParts = parts;
    printBlank = blank;
    printWindow = false;
    window.print();
  }

  // The browser's own Print (Ctrl+P) works too: the sheet is drawn just before the browser lays out the pages.
  function beforePrint() {
    flushSync(() => (printing = true));
  }

  async function rest(kind: 'short' | 'long') {
    const long = kind === 'long';
    const answer = await session.popUps.choose({
      title: long ? t.longRestTitle : t.shortRestTitle,
      message: long ? t.longRestText : shortRestText(),
      buttons: [
        { value: 'cancel', label: t.cancel },
        { value: 'rest', label: long ? t.longRest : t.shortRest, primary: true },
      ],
      cancel: 'cancel',
    });
    if (answer === 'rest') change(restSteps(long ? longRest(open.fields) : shortRest(open.fields)));
  }
</script>

<svelte:window bind:innerWidth={width} onbeforeprint={beforePrint} onafterprint={() => (printing = false)} />

<div class="screen-only">
  <TopBar {open} back={{ href: '#/', label: t.backToList }} {t}>
    {#if !noClass}
      <button type="button" {disabled} onclick={() => rest('short')}>{t.shortRest}</button>
      <button type="button" {disabled} onclick={() => rest('long')}>{t.longRest}</button>
    {/if}
    <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
  </TopBar>

  {#if listed.length && !elsewhereOnly}
    <CompanionBar
      character={open.meta.name || t.unnamed}
      companions={listed}
      shown={shownPrefix}
      {disabled}
      onshow={showCompanion}
      onadd={() => void addCompanion()}
      {t}
    />
  {/if}

  <div class="notes">
    <Notes notes={session.notes} />
    {#if updateLine}
      <UpdateLine
        update={updateLine}
        {t}
        onshow={showUpdate}
        onkeep={keepUpdate}
        onagain={() => void session.updateAgain()}
      />
    {/if}
  </div>
  {#if updateDetails !== undefined && sheetUpdate}
    <UpdateWindow
      update={sheetUpdate}
      name={open.meta.name || t.unnamed}
      details={updateDetails}
      {t}
      onkeep={keepUpdate}
      onundo={undoUpdate}
    />
  {/if}

  <!-- Open in another tab from the start: no sheet here, only the line offering to take it over. -->
  {#if !elsewhereOnly}
    {#if companion}
      <div class="play">
        <div class="side left">
          <CompanionVitals {companion} {disabled} {change} {t} />
        </div>
        <!-- An empty page has nothing to show yet but the way to fill it, on the left. -->
        {#if !isEmptyCompanion(companion)}
          <div class="middle">
            <div class="tabs" role="tablist">
              {#each companionTabs as [key, label] (key)}
                <button
                  type="button"
                  role="tab"
                  id={`tab-${key}`}
                  aria-selected={shownCompanionTab === key}
                  aria-controls="tab-panel"
                  onclick={() => (companionTab = key)}>{label}</button
                >
              {/each}
            </div>
            <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${shownCompanionTab}`}>
              {#if shownCompanionTab === 'checks'}
                <CompanionChecks {companion} {t} />
              {:else}
                <CompanionTab {companion} part={shownCompanionTab} {t} />
              {/if}
            </div>
          </div>
          {#if wide}
            <div class="side right">
              <CompanionChecks {companion} {t} />
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="play">
        <div class="side left">
          {#if noClass}
            <section class="start" aria-labelledby="no-class-title">
              <h2 id="no-class-title">{t.noClassTitle}</h2>
              <p>{t.noClassLine}</p>
              <a href={buildHref}>{t.menuBuild}</a>
            </section>
          {:else}
            <Vitals {fields} {disabled} {change} {ult} onult={(u) => void session.setUlt(u)} {t} />
          {/if}
        </div>

        <div class="middle">
          <div class="tabs" role="tablist">
            {#each tabs as [key, label] (key)}
              <button
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={shownTab === key}
                aria-controls="tab-panel"
                onclick={() => (tab = key)}>{label}</button
              >
            {/each}
          </div>
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${shownTab}`}>
            {#if shownTab === 'combat'}
              <CombatTab {fields} characterId={open.meta.id} {disabled} {change} {t} />
            {:else if shownTab === 'spells'}
              <SpellsTab {fields} characterId={open.meta.id} {disabled} {change} {t} />
            {:else if shownTab === 'checks'}
              <Checks {fields} {disabled} {change} {t} />
            {:else if shownTab === 'inventory'}
              <InventoryTab {fields} {disabled} {change} {t} />
            {:else if shownTab === 'features'}
              <FeaturesTab {fields} characterId={open.meta.id} {t} />
            {:else if shownTab === 'profile'}
              <ProfileTab
                {fields}
                images={open.images}
                {disabled}
                {change}
                setImage={(slot, file) => session.setImage(slot, file)}
                {t}
              />
            {:else}
              <NotesTab {fields} {disabled} {change} pick={(field, answer) => session.pick(field, answer)} {t} />
            {/if}
          </div>
        </div>

        {#if wide}
          <div class="side right">
            <Checks {fields} {disabled} {change} {t} />
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if menuOpen}
    <SheetMenu
      {session}
      {open}
      onclose={() => (menuOpen = false)}
      {toggleLanguage}
      onprint={() => {
        menuOpen = false;
        printWindow = true;
      }}
      onfillpdf={() => {
        menuOpen = false;
        fillPdfWindow = true;
      }}
      oncompanion={() => void addCompanion()}
      {t}
    />
  {/if}

  {#if fillPdfWindow}
    <FillPdfWindow {session} name={open.meta.name} onclose={() => (fillPdfWindow = false)} {t} />
  {/if}

  {#if printWindow}
    <PrintWindow
      available={printable}
      parts={printParts ?? printable}
      blank={printBlank}
      onprint={print}
      onclose={() => (printWindow = false)}
      {t}
    />
  {/if}
</div>

{#if printing}
  <PrintSheet
    fields={open.fields}
    images={open.images}
    parts={(printParts ?? printable).filter((part) => printable.includes(part))}
    blank={printBlank}
    {t}
  />
{/if}

<style>
  .notes {
    max-width: var(--page-max);
    margin-inline: auto;
    padding: 0 1rem;
  }

  .start {
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border: 1px solid var(--accent);
    border-radius: 0.75rem;
    background: var(--accent-soft);
  }

  .start h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  .start p {
    margin: 0;
  }

  .start a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1rem;
    border-radius: 0.5rem;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    text-decoration: none;
  }

  .play {
    max-width: var(--page-max);
    margin-inline: auto;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 380px;
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem 1rem 2rem;
  }

  /* The side columns stay in view while the middle scrolls. */
  .side {
    position: sticky;
    top: 0.75rem;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tabs button {
    position: relative;
    flex: none;
    /* No visible edge: the tab's text may come close to the button's side. */
    border: 0 solid transparent;
    border-radius: 0.5rem 0.5rem 0 0;
    background: none;
    color: var(--ink-muted);
    font-weight: 700;
  }

  .tabs button[aria-selected='true'] {
    color: var(--accent);
  }

  /*
   * Seven tabs (with Spells) in the middle column of a 768 px iPad (444 px), six in the three-column
   * layout of a 1180 px iPad (464 px): less padding and a slightly smaller size keep the last one whole,
   * also in German (measured: about 425 px). The column's width decides, so a container query.
   */
  .middle {
    container-type: inline-size;
  }

  @container (max-width: 560px) {
    .tabs {
      gap: 0;
    }

    .tabs button {
      padding: 0 0.25rem;
      font-size: 0.9375rem;
    }
  }

  .tabs button[aria-selected='true']::after {
    content: '';
    position: absolute;
    right: 0.5rem;
    bottom: 0;
    left: 0.5rem;
    height: 3px;
    border-radius: 2px;
    background: var(--accent);
  }

  @media (max-width: 1099px) {
    .play {
      grid-template-columns: 280px minmax(0, 1fr);
    }
  }

  /* Phones come later (roadmap); until then everything stacks. */
  @media (max-width: 699px) {
    .play {
      grid-template-columns: minmax(0, 1fr);
    }

    .side {
      position: static;
    }
  }
</style>
