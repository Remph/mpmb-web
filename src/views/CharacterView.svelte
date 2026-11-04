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
  import { flushSync } from 'svelte';
  import PrintSheet from './print/PrintSheet.svelte';
  import { printableParts } from '../play/print.ts';
  import type { PrintPart } from '../play/print.ts';
  import PrintWindow from './print/PrintWindow.svelte';
  import FillPdfWindow from './print/FillPdfWindow.svelte';
  import UpdateBanner from './mock/UpdateBanner.svelte';
  import UpdateWindow from './mock/UpdateWindow.svelte';

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

  const fields = $derived(open.fields);
  const disabled = $derived(open.status === 'opening' || open.status === 'error');
  const change = (steps: Step[]) => void session.change(steps);

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

  // MOCK-UP (M11): ?mock-update=a shows the line under the top bar, =b opens the window at once.
  const mock = new URLSearchParams(location.search).get('mock-update');
  let mockBanner = $state(mock === 'a');
  let mockWindow = $state(mock === 'b');

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
    <button type="button" {disabled} onclick={() => rest('short')}>{t.shortRest}</button>
    <button type="button" {disabled} onclick={() => rest('long')}>{t.longRest}</button>
    <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
  </TopBar>

  <div class="notes">
    <Notes notes={session.notes} />
    {#if mockBanner}<UpdateBanner onshow={() => (mockWindow = true)} onkeep={() => (mockBanner = false)} />{/if}
  </div>
  {#if mockWindow}<UpdateWindow
      onclose={() => {
        mockWindow = false;
        mockBanner = false;
      }}
    />{/if}

  <div class="play">
    <div class="side left">
      <Vitals {fields} {disabled} {change} {t} />
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
