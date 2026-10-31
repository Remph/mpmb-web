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
  import Vitals from './play/Vitals.svelte';

  interface Props {
    session: Session;
    open: OpenCharacter;
    toggleLanguage: () => void;
    t: Texts;
  }

  let { session, open, toggleLanguage, t }: Props = $props();

  type Tab = 'combat' | 'checks' | 'inventory' | 'features' | 'profile' | 'notes';
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
        ['checks', t.tabChecks],
        ['inventory', t.tabInventory],
        ['features', t.tabFeatures],
        ['profile', t.tabProfile],
        ['notes', t.tabNotes],
      ] as const
    ).filter(([key]) => !(wide && key === 'checks')),
  );
  const shownTab = $derived(wide && tab === 'checks' ? 'combat' : tab);

  const fields = $derived(open.fields);
  const disabled = $derived(open.status === 'opening' || open.status === 'error');
  const statusText = $derived(
    { opening: t.opening, working: t.saving, saving: t.saving, saved: t.saved, error: '' }[open.status],
  );
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

<header class="top">
  <a class="back" href="#/">← {t.backToList}</a>
  <div class="who">
    <h1>{open.meta.name || t.unnamed}</h1>
    <p>{[open.meta.classes, open.meta.species].filter(Boolean).join(' · ')}</p>
  </div>
  {#if statusText}<span class="status" class:busy={open.status !== 'saved'} aria-live="polite">{statusText}</span>{/if}
  <div class="actions">
    <button type="button" {disabled} onclick={() => rest('short')}>{t.shortRest}</button>
    <button type="button" {disabled} onclick={() => rest('long')}>{t.longRest}</button>
    <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
  </div>
</header>

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
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    padding: 0.375rem max(1rem, env(safe-area-inset-right)) 0.375rem max(1rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .back {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    font-weight: 500;
    text-decoration: none;
  }

  .who {
    flex: 1;
    min-width: 12rem;
    line-height: 1.2;
  }

  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 800;
  }

  .who p {
    margin: 0;
    overflow: hidden;
    color: var(--ink-muted);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .status.busy::before {
    content: '';
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    margin-right: 0.375rem;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: -0.1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status.busy::before {
      animation: none;
    }
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

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
    border: 0;
    border-radius: 0.5rem 0.5rem 0 0;
    background: none;
    color: var(--ink-muted);
    font-weight: 700;
  }

  .tabs button[aria-selected='true'] {
    color: var(--accent);
  }

  /* Six tabs in the middle column of a 768 px iPad: less padding keeps the last one whole, also in German. */
  @media (max-width: 860px) {
    .tabs button {
      padding: 0 0.375rem;
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

    .actions {
      flex-wrap: wrap;
    }
  }
</style>
