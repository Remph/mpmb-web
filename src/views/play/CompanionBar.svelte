<!--
  The bar under the top bar on a sheet with companions (Remph picked "switch the whole view", 2026-11-04).
  Closed it is one line: who is shown, the way back to the character and the button that opens the list.
  Open it lists the character and every companion with its hit points, plus "+ Companion". Whether the
  list is open is kept for this browser, like the language.
-->
<script lang="ts">
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { companionLabel } from '../../play/companions.ts';
  import type { Companion } from '../../play/companions.ts';

  interface Props {
    /** The character's name, for "Back to …" and the first button. */
    character: string;
    companions: Companion[];
    /** The shown companion's prefix, or null for the character. */
    shown: string | null;
    disabled: boolean;
    onshow: (prefix: string | null) => void;
    onadd: () => void;
    t: Texts;
  }

  let { character, companions, shown, disabled, onshow, onadd, t }: Props = $props();

  const STORAGE_KEY = 'mpmb-web.companionList';
  let listOpen = $state(readOpen());

  function readOpen(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open';
    } catch {
      return false;
    }
  }

  function toggle() {
    listOpen = !listOpen;
    try {
      localStorage.setItem(STORAGE_KEY, listOpen ? 'open' : 'closed');
    } catch {
      // Storage blocked (private mode): the list still opens and closes until the page is closed.
    }
  }

  const current = $derived(companions.find((c) => c.prefix === shown) ?? null);
  const hpText = (c: Companion): string =>
    c.hp.max === null ? '' : fill(t.companionHp, { current: c.hp.current ?? c.hp.max, max: c.hp.max });
  const nameOf = (c: Companion): string => companionLabel(c) || t.companionEmptyPage;
</script>

<nav class="bar" aria-label={t.companionsList}>
  <div class="inner">
    <div class="line">
      {#if current}
        <button type="button" class="back" onclick={() => onshow(null)}
          >← {fill(t.companionBack, { name: character })}</button
        >
        <span class="now"><b>{nameOf(current)}</b> <small>{hpText(current)}</small></span>
      {:else}
        <span class="now"><b>{t.companions}</b></span>
      {/if}
      <button type="button" class="toggle" aria-expanded={listOpen} aria-controls="companion-list" onclick={toggle}>
        {counted(t.companionsCountOne, t.companionsCount, companions.length)}
        <span aria-hidden="true">{listOpen ? '▴' : '▾'}</span>
        <span class="sr">{listOpen ? t.companionsHideList : t.companionsShowList}</span>
      </button>
    </div>
    {#if listOpen}
      <div class="list" id="companion-list">
        <button type="button" class="pick" aria-pressed={shown === null} onclick={() => onshow(null)}>
          {character}<small>{t.companionCharacter}</small>
        </button>
        {#each companions as c (c.prefix)}
          <button type="button" class="pick" aria-pressed={shown === c.prefix} onclick={() => onshow(c.prefix)}>
            {nameOf(c)}<small>{hpText(c) || c.kind}</small>
          </button>
        {/each}
        <button type="button" class="pick add" {disabled} onclick={onadd}>+ {t.companionAdd}</button>
      </div>
    {/if}
  </div>
</nav>

<style>
  .bar {
    border-bottom: 1px solid var(--line);
    background: var(--accent-soft);
  }

  .inner {
    max-width: var(--page-max);
    margin-inline: auto;
    padding: 0.25rem 1rem;
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
    min-height: 44px;
  }

  .now {
    flex: 1 1 auto;
    min-width: 0;
  }

  .now small {
    color: var(--ink-muted);
  }

  .back,
  .toggle {
    background: var(--surface);
    font-weight: 700;
  }

  .back {
    color: var(--accent);
  }

  .toggle {
    margin-left: auto;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.25rem 0 0.5rem;
  }

  .pick {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    min-height: 44px;
    padding: 0.25rem 0.75rem;
    line-height: 1.15;
    text-align: left;
  }

  .pick small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .pick[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }

  .pick[aria-pressed='true'] small {
    color: inherit;
    opacity: 0.85;
  }

  .pick.add {
    border-style: dashed;
    color: var(--ink-muted);
  }
</style>
