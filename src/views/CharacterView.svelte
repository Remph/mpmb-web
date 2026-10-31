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

<svelte:window bind:innerWidth={width} />

<TopBar {open} back={{ href: '#/', label: t.backToList }} {t}>
  <button type="button" {disabled} onclick={() => rest('short')}>{t.shortRest}</button>
  <button type="button" {disabled} onclick={() => rest('long')}>{t.longRest}</button>
  <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
</TopBar>

<div class="notes"><Notes notes={session.notes} /></div>

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
        <CombatTab {fields} {disabled} {change} {t} />
      {:else if shownTab === 'spells'}
        <SpellsTab {fields} {disabled} {change} {t} />
      {:else if shownTab === 'checks'}
        <Checks {fields} {disabled} {change} {t} />
      {:else if shownTab === 'inventory'}
        <InventoryTab {fields} {disabled} {change} {t} />
      {:else if shownTab === 'features'}
        <FeaturesTab {fields} {t} />
      {:else if shownTab === 'profile'}
        <ProfileTab {fields} {disabled} {change} {t} />
      {:else}
        <NotesTab {fields} {disabled} {change} {t} />
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
  <SheetMenu {session} {open} onclose={() => (menuOpen = false)} {toggleLanguage} {t} />
{/if}

<style>
  .notes {
    padding: 0 1rem;
  }

  .play {
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
