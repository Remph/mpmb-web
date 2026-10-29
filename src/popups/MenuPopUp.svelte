<!--
  MPMB's pop-up menus (app.popUpMenuEx). Acrobat shows them as a context menu with fly-out submenus;
  on touch screens that needs hovering, so here a submenu opens in place with a Back button.
-->
<script lang="ts">
  import type { MenuItem } from '../engine/host.ts';
  import type { Texts } from '../i18n.ts';
  import Modal from './Modal.svelte';

  interface Props {
    items: MenuItem[];
    t: Texts;
    answer: (picked: string | null) => void;
  }

  let { items, t, answer }: Props = $props();
  /** The submenus opened so far. */
  let path: MenuItem[] = $state([]);

  const shown = $derived.by(() => {
    const at = path[path.length - 1];
    return at ? [at.oSubMenu ?? []].flat() : items;
  });

  /** Acrobat's separator line is an item named "-". */
  const isSeparator = (item: MenuItem) => item.cName === '-';

  function pick(item: MenuItem) {
    if (item.oSubMenu) path = [...path, item];
    else answer(item.cReturn ?? item.cName);
  }
</script>

<Modal title={path.length ? (path[path.length - 1]?.cName ?? '') : t.menuTitle} onescape={() => answer(null)}>
  <ul role="menu">
    {#each shown as item, i (i)}
      {#if isSeparator(item)}
        <li role="separator"></li>
      {:else}
        <li role="none">
          <button type="button" role="menuitem" disabled={item.bEnabled === false} onclick={() => pick(item)}>
            <span class="mark">{item.bMarked ? '✓' : ''}</span>
            <span class="name" lang="en">{item.cName}</span>
            {#if item.oSubMenu}<span class="more" aria-hidden="true">›</span>{/if}
          </button>
        </li>
      {/if}
    {/each}
  </ul>
  {#snippet actions()}
    {#if path.length}
      <button type="button" onclick={() => (path = path.slice(0, -1))}>{t.back}</button>
    {/if}
    <button type="button" onclick={() => answer(null)}>{t.cancel}</button>
  {/snippet}
</Modal>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li[role='separator'] {
    border-top: 1px solid var(--line);
    margin: 0.25rem 0;
  }

  button[role='menuitem'] {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 44px;
    padding: 0.25rem 0.5rem;
    border: 0;
    border-radius: 0.375rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button[role='menuitem']:not(:disabled):hover,
  button[role='menuitem']:focus-visible {
    background: var(--hover);
  }

  button[role='menuitem']:disabled {
    color: var(--ink-muted);
    cursor: default;
  }

  .mark {
    width: 1rem;
    flex: none;
  }

  .name {
    flex: 1;
  }

  .more {
    font-size: 1.25rem;
    color: var(--ink-muted);
  }
</style>
