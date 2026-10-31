<!--
  The sheet menu (redesigned in M6 as Nick picked it, 2026-10-31): what isn't needed at the table, grouped
  by what the player wants to do. Building the character first, then this character's settings with their
  state, then what belongs to this browser. MPMB's own full menu stays at the bottom, folded, for anything
  else. Opened from the top bar of the play view and the Build screen.
-->
<script lang="ts">
  import type { UnitSystem } from '../../engine/builder.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { valueOf } from '../../play/read.ts';
  import type { OpenCharacter, Session } from '../../session.svelte.ts';
  import Modal from '../../popups/Modal.svelte';
  import MenuTree from '../MenuTree.svelte';

  interface Props {
    session: Session;
    open: OpenCharacter;
    onclose: () => void;
    toggleLanguage: () => void;
    t: Texts;
  }

  let { session, open, onclose, toggleLanguage, t }: Props = $props();

  // MPMB's bookmarks: "Functions" is its menu; the page jumps under "Navigation" mean nothing here.
  const MENU_ROOT = 'Functions';
  /**
   * Entries that only change the PDF itself (pages, colours, fonts, printing, flattening), duplicate
   * what the app does its own way (importing), or belong to pages the app doesn't show yet (the
   * Adventurers League logsheet, M8). "Modifiers" shows or hides the PDF's blue modifier fields, which
   * the play view doesn't show (yet), so it seemed to do nothing (the owner asked, 2026-10-31).
   * Hidden here; MPMB's scripts keep them.
   */
  const PDF_ONLY = [
    'Set Pages Layout',
    'Import/Export',
    'Text Options',
    'Adventurers League',
    'Print',
    'Flatten',
    'Set Color Theme',
    'Modifiers',
  ];
  const menu = $derived(
    (open.menu.filter((node) => node.name === MENU_ROOT)[0]?.children ?? []).filter(
      (node) => !PDF_ONLY.includes(node.name.trim()),
    ),
  );
  const busy = $derived(open.status === 'opening' || open.status === 'working');
  const addOnNames = $derived([
    // MPMB names imported files "2026/10/29 - name.js"; the date says when it was imported.
    ...open.meta.addOns.files,
    ...(open.meta.addOns.manual ? [t.pastedScript] : []),
  ]);
  const level = $derived(Number(valueOf(open.fields, 'Character Level')) || 0);
  const units = $derived<UnitSystem>(valueOf(open.fields, 'Unit System') === 'metric' ? 'metric' : 'imperial');
  const buildHref = $derived(`#/character/${encodeURIComponent(open.meta.id)}/build`);

  /** A menu item runs MPMB's scripts, which may open their own pop-ups: this window steps aside. */
  function run(path: string[]) {
    onclose();
    void session.runMenu(path);
  }

  function build(levelUp: boolean) {
    session.levelUpNext = levelUp;
    onclose();
    location.hash = buildHref;
  }

  function setUnits(system: UnitSystem) {
    if (system === units) return;
    onclose();
    void session.setUnits(system);
  }
</script>

<Modal title={t.sheetMenu} onescape={onclose} closeLabel={t.close} wide>
  {#if !session.client.answersPopUps}
    <p class="warning">{t.notIsolated}</p>
  {/if}

  <h3>{t.menuCharacter}</h3>
  <div class="tiles">
    <button type="button" class="tile main" onclick={() => build(false)}>
      <b>{t.menuBuild}</b><small>{t.menuBuildLine}</small>
    </button>
    <button type="button" class="tile" disabled={busy || level === 0} onclick={() => build(true)}>
      <b>{t.levelUp}</b><small>{level ? fill(t.menuLevelNow, { level }) : t.menuLevelNone}</small>
    </button>
    <button type="button" class="tile" disabled={busy} onclick={() => run([MENU_ROOT, 'Add Extra Materials'])}>
      <b>{t.addOnsTitle}</b>
      <small class="names"
        >{addOnNames.length
          ? `${counted(t.addOnCountOne, t.addOnCount, addOnNames.length)}: ${addOnNames.join(', ')}`
          : t.menuAddOnsNone}</small
      >
    </button>
    <button type="button" class="tile" disabled={busy} onclick={() => run([MENU_ROOT, 'Source Material'])}>
      <b>{t.menuSources}</b><small>{t.menuSourcesLine}</small>
    </button>
  </div>

  <h3>{t.menuSettings}</h3>
  <div class="settings">
    <div class="setting">
      <span id="units-label">{t.menuUnits}<small>{t.menuUnitsLine}</small></span>
      <span class="seg" role="group" aria-labelledby="units-label">
        <button type="button" aria-pressed={units === 'imperial'} disabled={busy} onclick={() => setUnits('imperial')}
          >{t.menuImperial}</button
        >
        <button type="button" aria-pressed={units === 'metric'} disabled={busy} onclick={() => setUnits('metric')}
          >{t.menuMetric}</button
        >
      </span>
    </div>
    <div class="setting">
      <span>{t.menuWeight}<small>{t.menuWeightLine}</small></span>
      <button type="button" disabled={busy} onclick={() => run([MENU_ROOT, 'Weight'])}>{t.buildChange}</button>
    </div>
    <div class="setting">
      <span>{t.menuSpells}<small>{t.menuSpellsLine}</small></span>
      <button type="button" disabled={busy} onclick={() => run([MENU_ROOT, 'Spells Options'])}>{t.buildChange}</button>
    </div>
  </div>

  <h3>{t.menuBrowser}</h3>
  <div class="tiles">
    <button type="button" class="tile" onclick={() => session.backUp([open.meta.id])}>
      <b>{t.backUp}</b><small>{t.menuBackUpLine}</small>
    </button>
    <button type="button" class="tile" onclick={toggleLanguage}>
      <b lang={t.switchLanguage === 'English' ? 'en' : 'de'}>{t.switchLanguage}</b><small>{t.menuLanguageLine}</small>
    </button>
    <button type="button" class="tile warn" disabled={busy} onclick={() => run([MENU_ROOT, 'Reset'])}>
      <b>{t.menuReset}</b><small>{t.menuResetLine}</small>
    </button>
  </div>

  <details class="full">
    <summary>{t.menuFull}</summary>
    <div class="menu" lang="en">
      <MenuTree nodes={menu} path={[MENU_ROOT]} disabled={busy} {run} />
    </div>
  </details>
</Modal>

<style>
  h3 {
    margin: 1rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  h3:first-of-type {
    margin-top: 0.25rem;
  }

  .warning {
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.5rem;
  }

  .tile {
    display: grid;
    align-content: center;
    gap: 0.125rem;
    min-height: 64px;
    padding: 0.5rem 0.875rem;
    border-radius: 0.75rem;
    text-align: left;
  }

  .tile b {
    font-weight: 700;
  }

  .tile small,
  .setting small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .tile.main {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .tile.main b {
    color: var(--accent);
  }

  .tile.warn b {
    color: var(--danger);
  }

  /* Add-on file names can be long: two lines at most. */
  .names {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .settings {
    padding: 0.25rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .setting {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 52px;
    padding: 0.25rem 0;
    border-top: 1px solid var(--line);
  }

  .setting:first-child {
    border-top: 0;
  }

  .setting small {
    display: block;
  }

  .seg {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .full {
    margin-top: 1rem;
    padding: 0 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .full summary {
    display: flex;
    align-items: center;
    min-height: 48px;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }

  .menu {
    padding: 0 0 0.5rem;
  }
</style>
