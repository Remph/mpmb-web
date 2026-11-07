<!--
  The play view (M4): the screen a player keeps open at the table. Three columns on a laptop: hit
  points and conditions left, abilities and skills right, and the middle switches between combat,
  inventory, features and notes. Narrower (the iPad in portrait), the right column becomes a tab.
  Every tap goes through MPMB's own fields (session.change), so rules and saving stay MPMB's.
-->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import { dawn, dawnFeatures, longRest, pactSlots, shortRest } from '../play/rules.ts';
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
  import DawnWindow from './play/DawnWindow.svelte';
  import UnfoldBar from './play/UnfoldBar.svelte';
  import CompanionChecks from './play/CompanionChecks.svelte';
  import CompanionTab from './play/CompanionTab.svelte';
  import CompanionVitals from './play/CompanionVitals.svelte';
  import AddCompanionWindow from './play/AddCompanionWindow.svelte';
  import {
    ADD_COMPANION_PAGE,
    ADD_FIRST_COMPANION_PAGE,
    addedPage,
    companionMenu,
    goneSpell,
    isEmptyCompanion,
    PAGES_LAYOUT_BOOKMARK,
    readCompanions,
    stillShown,
    summonEdits,
  } from '../play/companions.ts';
  import type { Companion } from '../play/companions.ts';
  import type { CompanionCreature, CompanionTemplate } from '../engine/companion-options.ts';
  import { homebrew } from '../homebrew/switches.svelte.ts';
  import { readUlt } from '../homebrew/ult.ts';
  import { readEffects } from '../play/effects.ts';
  import { readSpellSlots, valueOf } from '../play/read.ts';
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
   * A page for a new companion: an empty one if the sheet has one (MPMB makes one with every new sheet), else
   * MPMB's "Add extra companion page" on the last page's menu (or MPMB's pages layout menu, with no page left).
   */
  async function addPage(): Promise<string | null> {
    const empty = companions.find(isEmptyCompanion);
    if (empty) return empty.prefix;
    const before = companions.map((c) => c.prefix);
    const last = before[before.length - 1];
    await (last
      ? session.pick(companionMenu(last), ADD_COMPANION_PAGE)
      : session.pickBookmark(PAGES_LAYOUT_BOOKMARK, ADD_FIRST_COMPANION_PAGE));
    return addedPage(
      before,
      readCompanions(open.fields).map((c) => c.prefix),
    );
  }

  // "+ Companion" and "Cast … again" open one window (Remph, 2026-11-07). What it offers comes from the sheet's
  // lists, so it is read again each time it opens: an add-on script added since may bring new creatures. The
  // templates also tell which companions come from a spell, and so are gone at 0 HP.
  let companionOptions = $state<{ id: string; templates: CompanionTemplate[] } | null>(null);
  let companionWindow = $state<{ page: Companion | null } | null>(null);
  let loadingOptions = false;
  const templates = $derived(companionOptions?.id === open.meta.id ? companionOptions.templates : null);
  const spells = $derived(
    new Map((templates ?? []).flatMap((tpl) => (tpl.spell === null ? [] : [[tpl.key, tpl.spell] as const]))),
  );
  const gone = $derived(companions.filter((c) => goneSpell(c, spells) !== null).map((c) => c.prefix));
  const highestSlot = $derived(Math.max(0, ...readSpellSlots(open.fields).map((slots) => slots.level)));

  async function loadCompanionOptions() {
    const id = open.meta.id;
    loadingOptions = true;
    try {
      const loaded = await session.companionOptions();
      if (open.meta.id === id) companionOptions = { id, templates: loaded ?? [] };
    } finally {
      loadingOptions = false;
    }
  }

  // A page made from a template needs them to show whether it is gone, before any window opens.
  $effect(() => {
    if (open.status === 'opening' || templates !== null || loadingOptions) return;
    if (companions.some((c) => c.template !== '')) void loadCompanionOptions();
  });

  function openCompanionWindow(page: Companion | null) {
    menuOpen = false;
    companionWindow = { page };
    void loadCompanionOptions();
  }

  async function addEmptyPage() {
    companionWindow = null;
    const prefix = await addPage();
    if (prefix) showCompanion(prefix);
  }

  /**
   * The window's pick through MPMB's own Companion Options menu, as the player would pick it there; casting
   * again first empties the page (see summonEdits). MPMB then asks what it asks, like the creature type.
   */
  async function summon(creature: CompanionCreature, level: number | null) {
    const page = companionWindow?.page ?? null;
    companionWindow = null;
    const prefix = page?.prefix ?? (await addPage());
    if (!prefix) return;
    showCompanion(prefix);
    const edits = summonEdits(prefix, level, page !== null && !isEmptyCompanion(page));
    if (edits.length) await session.change(edits);
    await session.pick(companionMenu(prefix), creature.answer);
  }

  const fields = $derived(open.fields);
  const disabled = $derived(readOnly(open.status));
  /** Open in another tab before this one loaded its sheet (see store/tab-lock.ts). */
  const elsewhereOnly = $derived(open.status === 'elsewhere' && Object.keys(open.fields).length === 0);
  const change = (steps: Step[]) => void session.change(steps);
  /** The ult charges card only while its homebrew switch is on; the values stay with the character either way. */
  const ult = $derived(homebrew.switches.ultCharges ? readUlt(open.meta.homebrew?.ult) : null);
  const effects = $derived(readEffects(open.meta.homebrew?.effects));
  const acEdge = $derived(open.meta.homebrew?.acEdge ?? '');
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

  /** What a short rest gives back: Pact Magic slots for a warlock, half the hit points with the house rule. */
  const shortRestText = (): string =>
    [
      t.shortRestText,
      pactSlots(open.fields) ? t.shortRestPactMagic : '',
      homebrew.switches.shortRestHalfHp ? t.shortRestHalfHp : '',
    ]
      .filter(Boolean)
      .join(' ');

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

  // The top bar folds away for more room on a 13-inch laptop in a browser window (session feedback,
  // 2026-11-04). Kept per browser, like the language. Only where the tab row is there to bring it back.
  const FOLD_KEY = 'mpmb-web.topBar';
  let folded = $state(readFolded());
  function readFolded(): boolean {
    try {
      return localStorage.getItem(FOLD_KEY) === 'folded';
    } catch {
      return false;
    }
  }
  function setFolded(value: boolean) {
    folded = value;
    try {
      localStorage.setItem(FOLD_KEY, value ? 'folded' : 'shown');
    } catch {
      // Storage blocked (private mode): the bar still folds until the page is closed.
    }
  }
  const canFold = $derived(!elsewhereOnly && !(companion && isEmptyCompanion(companion)));
  const barFolded = $derived(folded && canFold);

  // Magic items that come back at dawn get their own button: dawn and a long rest often fall together,
  // but not always, so the player says when (session feedback, 2026-11-04).
  const dawnList = $derived(open.status === 'opening' ? [] : dawnFeatures(fields));
  let dawnOpen = $state(false);
  function applyDawn(regained: Record<number, number>) {
    dawnOpen = false;
    change(restSteps(dawn(fields, regained)));
  }

  async function rest(kind: 'short' | 'long') {
    const long = kind === 'long';
    const answer = await session.popUps.choose({
      title: long ? t.longRestTitle : t.shortRestTitle,
      message: long ? (dawnList.length ? `${t.longRestText} ${t.longRestDawn}` : t.longRestText) : shortRestText(),
      buttons: [
        { value: 'cancel', label: t.cancel },
        { value: 'rest', label: long ? t.longRest : t.shortRest, primary: true },
      ],
      cancel: 'cancel',
    });
    if (answer === 'rest')
      change(restSteps(long ? longRest(open.fields) : shortRest(open.fields, homebrew.switches.shortRestHalfHp)));
  }
</script>

<svelte:window bind:innerWidth={width} onbeforeprint={beforePrint} onafterprint={() => (printing = false)} />

<div class="screen-only">
  {#if !barFolded}
    <TopBar {open} back={{ href: '#/', label: t.backToList }} {t} onfold={canFold ? () => setFolded(true) : undefined}>
      {#if !noClass}
        <button type="button" {disabled} onclick={() => rest('short')}>{t.shortRest}</button>
        <button type="button" {disabled} onclick={() => rest('long')}>{t.longRest}</button>
      {/if}
      {#if dawnList.length}
        <button type="button" {disabled} onclick={() => (dawnOpen = true)}>{t.dawn}</button>
      {/if}
      <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
    </TopBar>
  {/if}

  {#if listed.length && !elsewhereOnly}
    <CompanionBar
      character={open.meta.name || t.unnamed}
      companions={listed}
      shown={shownPrefix}
      {disabled}
      {gone}
      onshow={showCompanion}
      onadd={() => openCompanionWindow(null)}
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
      <div class="play" class:gone={gone.includes(companion.prefix)}>
        <div class="side left">
          <CompanionVitals
            {companion}
            {disabled}
            {change}
            gone={goneSpell(companion, spells)}
            oncastagain={() => companion && openCompanionWindow(companion)}
            {t}
          />
        </div>
        <!-- An empty page has nothing to show yet but the way to fill it, on the left. -->
        {#if !isEmptyCompanion(companion)}
          <div class="middle">
            <div class="tabrow">
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
              {#if barFolded}
                <UnfoldBar
                  name={open.meta.name || t.unnamed}
                  busy={open.status !== 'saved'}
                  onunfold={() => setFolded(false)}
                  {t}
                />
              {/if}
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
            <Vitals
              {fields}
              {disabled}
              {change}
              {ult}
              onult={(u) => void session.setUlt(u)}
              {effects}
              oneffects={(list) => void session.setEffects(list)}
              {acEdge}
              onacedge={(edge) => void session.setAcEdge(edge)}
              {t}
            />
          {/if}
        </div>

        <div class="middle">
          <div class="tabrow">
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
            {#if barFolded}
              <UnfoldBar
                name={open.meta.name || t.unnamed}
                busy={open.status !== 'saved'}
                onunfold={() => setFolded(false)}
                {t}
              />
            {/if}
          </div>
          <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${shownTab}`}>
            {#if shownTab === 'combat'}
              <CombatTab
                {fields}
                characterId={open.meta.id}
                {disabled}
                {change}
                {ult}
                onsetup={(row, set) => void session.setAttackSetup(row, set)}
                {t}
              />
            {:else if shownTab === 'spells'}
              <SpellsTab {fields} characterId={open.meta.id} {disabled} {change} {t} />
            {:else if shownTab === 'checks'}
              <Checks {fields} {disabled} {change} {t} />
            {:else if shownTab === 'inventory'}
              <InventoryTab {fields} {disabled} {change} load={() => session.builderInfo()} {t} />
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

  {#if companionWindow}
    <AddCompanionWindow
      {templates}
      page={companionWindow.page}
      {highestSlot}
      onsummon={(creature, level) => void summon(creature, level)}
      onempty={() => void addEmptyPage()}
      onclose={() => (companionWindow = null)}
      {t}
    />
  {/if}

  {#if dawnOpen}
    <DawnWindow features={dawnList} onapply={applyDawn} onclose={() => (dawnOpen = false)} {t} />
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
      oncompanion={() => openCompanionWindow(null)}
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

  /* A companion that disappeared: its numbers stay readable but step back behind the way to bring it back.
     The tab row keeps its full colour: dimmed, the tabs would look switched off but still work. */
  .play.gone #tab-panel,
  .play.gone .right {
    opacity: 0.5;
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

  /* The tabs, and at their end the way back to a folded top bar. */
  .tabrow {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid var(--line);
  }

  .tabs {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-self: stretch;
    gap: 0.25rem;
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

  /* With the folded bar's pill at the row's end, the tabs go compact a little earlier (review of #56: at
   * 1280 px the pill pushed "Notes" out of sight). */
  @container (max-width: 720px) {
    .tabrow:has(:global(.unfold)) .tabs {
      gap: 0;
    }

    .tabrow:has(:global(.unfold)) .tabs button {
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
