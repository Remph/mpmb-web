<!--
  An opened character, until the play view (M4) exists: who it is, a few numbers from the sheet,
  its add-on scripts, and MPMB's own menu, whose dialogs and menus show how the pop-ups work.
-->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import type { OpenCharacter, Session } from '../session.svelte.ts';
  import MenuTree from './MenuTree.svelte';
  import Notes from './Notes.svelte';

  interface Props {
    session: Session;
    open: OpenCharacter;
    t: Texts;
  }

  let { session, open, t }: Props = $props();

  /** The text a field shows: its Format text ("+4", "9 m") or its value. */
  const shown = (name: string): string => {
    const view = open.fields[name];
    if (!view) return '';
    const text = view.text ?? view.value;
    return Array.isArray(text) ? text.join(', ') : text;
  };

  const facts = $derived([
    { label: t.level, value: shown('Character Level') },
    { label: t.hitPoints, value: shown('HP Max') },
    { label: t.armorClass, value: shown('AC') },
    { label: t.proficiency, value: shown('Proficiency Bonus') },
    { label: t.speed, value: shown('Speed') },
  ]);

  // MPMB's bookmarks: "Functions" is its menu; the page jumps under "Navigation" mean nothing here.
  const MENU_ROOT = 'Functions';
  const menu = $derived(open.menu.filter((node) => node.name === MENU_ROOT)[0]?.children ?? []);
  const busy = $derived(open.status === 'opening' || open.status === 'working');
  const statusText = $derived(
    { opening: t.opening, working: t.working, saving: t.saving, saved: t.saved, error: '' }[open.status],
  );
  const addOnNames = $derived([
    // MPMB names imported files "2026/10/29 - name.js"; the date says when it was imported.
    ...open.meta.addOns.files,
    ...(open.meta.addOns.manual ? [t.pastedScript] : []),
  ]);
</script>

<nav>
  <a href="#/">← {t.backToList}</a>
  {#if statusText}<span class="status" class:busy aria-live="polite">{statusText}</span>{/if}
</nav>

<h1>{open.meta.name || t.unnamed}</h1>
<p class="sub">{[open.meta.classes, open.meta.species].filter(Boolean).join(' · ')}</p>

<Notes notes={session.notes} />

{#if !session.client.answersPopUps}
  <p class="warning">{t.notIsolated}</p>
{/if}

<dl class="facts">
  {#each facts as fact (fact.label)}
    <div>
      <dt>{fact.label}</dt>
      <dd>{fact.value || '–'}</dd>
    </div>
  {/each}
</dl>

<section>
  <h2>{t.addOnsTitle}</h2>
  {#if addOnNames.length}
    <ul class="add-ons">
      {#each addOnNames as name (name)}<li>{name}</li>{/each}
    </ul>
  {:else}
    <p>{t.noAddOns}</p>
  {/if}
</section>

<section>
  <h2>{t.mpmbMenu}</h2>
  <p class="hint">{t.playViewSoon}</p>
  <div class="menu" lang="en">
    <MenuTree nodes={menu} path={[MENU_ROOT]} disabled={busy} run={(path) => session.runMenu(path)} />
  </div>
  <div class="row">
    <button type="button" onclick={() => session.backUp([open.meta.id])}>{t.backUp}</button>
  </div>
</section>

<style>
  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }

  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
  }

  .status {
    color: var(--ink-muted);
    font-size: 0.9375rem;
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

  h1 {
    margin: 0;
    font-size: clamp(1.75rem, 4vw, 2.25rem);
    line-height: 1.15;
  }

  .sub {
    margin: 0.25rem 0 1.25rem;
    color: var(--ink-muted);
  }

  .warning {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.5rem;
    margin: 0 0 1.5rem;
  }

  .facts div {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
  }

  dt {
    font-size: 0.875rem;
    color: var(--ink-muted);
  }

  dd {
    margin: 0;
    font-size: 1.375rem;
    font-weight: 600;
  }

  h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
    margin: 0 0 0.5rem;
  }

  section {
    margin-bottom: 1.5rem;
  }

  .add-ons {
    margin: 0;
    padding-left: 1.25rem;
    overflow-wrap: anywhere;
  }

  .hint {
    color: var(--ink-muted);
    margin: 0 0 0.5rem;
  }

  .menu {
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
    padding: 0.25rem 0.5rem 0.25rem 0;
    margin-bottom: 1rem;
  }

  .row {
    display: flex;
    gap: 0.5rem;
  }
</style>
