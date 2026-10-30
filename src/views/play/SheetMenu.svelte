<!--
  What isn't needed at the table: MPMB's own menu (its dialogs are drawn generically), the character's
  add-on scripts, a backup and the language. Opened from the top bar.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
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
   * Adventurers League logsheet, M8). Hidden here; MPMB's scripts keep them.
   */
  const PDF_ONLY = [
    'Set Pages Layout',
    'Import/Export',
    'Text Options',
    'Adventurers League',
    'Print',
    'Flatten',
    'Set Color Theme',
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

  /** A menu item runs MPMB's scripts, which may open their own pop-ups: this window steps aside. */
  function run(path: string[]) {
    onclose();
    void session.runMenu(path);
  }
</script>

<Modal title={t.sheetMenu} onescape={onclose} wide>
  <div class="row">
    <button type="button" onclick={() => session.backUp([open.meta.id])}>{t.backUp}</button>
    <button type="button" onclick={toggleLanguage} lang={t.switchLanguage === 'English' ? 'en' : 'de'}
      >{t.switchLanguage}</button
    >
  </div>

  {#if !session.client.answersPopUps}
    <p class="warning">{t.notIsolated}</p>
  {/if}

  <h3>{t.addOnsTitle}</h3>
  {#if addOnNames.length}
    <ul class="add-ons">
      {#each addOnNames as name (name)}<li>{name}</li>{/each}
    </ul>
  {:else}
    <p>{t.noAddOns}</p>
  {/if}

  <h3>{t.mpmbMenu}</h3>
  <div class="menu" lang="en">
    <MenuTree nodes={menu} path={[MENU_ROOT]} disabled={busy} {run} />
  </div>

  {#snippet actions()}
    <button type="button" class="primary" onclick={onclose}>{t.close}</button>
  {/snippet}
</Modal>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  h3 {
    margin: 1rem 0 0.25rem;
    font-size: 1rem;
  }

  p {
    margin: 0;
  }

  .warning {
    margin-top: 0.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
  }

  .add-ons {
    margin: 0;
    padding-left: 1.25rem;
    overflow-wrap: anywhere;
  }

  .menu {
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    padding: 0.25rem 0.5rem 0.25rem 0;
  }
</style>
