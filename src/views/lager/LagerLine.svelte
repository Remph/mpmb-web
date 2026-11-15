<!--
  The Lager's line at the end of the Inventory tab (M16, Nick picked P3): what the group has in storage, and the
  button that opens the side panel. The numbers stay fresh while the tab is shown.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { LagerStore } from '../../lager/lager.svelte.ts';
  import { goldText, placeCounts } from '../../lager/lager.ts';
  import LagerPanel from './LagerPanel.svelte';

  interface Props {
    store: LagerStore;
    t: Texts;
  }

  let { store, t }: Props = $props();
  let open = $state(false);

  $effect(() => store.watch());

  const lager = $derived(store.lager);
  const line = $derived.by(() => {
    if (!store.on) return t.lagerLineOff;
    if (!lager?.groups.length) return t.lagerLineEmpty;
    return fill(t.lagerLine, { items: placeCounts(lager).lager, gold: goldText(lager.copper, t.locale) });
  });
</script>

<section class="lager" aria-labelledby="lager-title">
  <div>
    <h2 id="lager-title">{t.lagerTitle}</h2>
    <p>{line}</p>
  </div>
  <button type="button" disabled={!store.on} onclick={() => (open = true)}>{t.lagerOpen}</button>
</section>

{#if open}
  <LagerPanel {store} onclose={() => (open = false)} {t} />
{/if}

<style>
  /* Like the tab's panels, with the button beside the line where there is room. */
  .lager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
  }

  p {
    margin: 0.25rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  button {
    padding: 0 1rem;
    color: var(--accent);
    font-weight: 600;
  }
</style>
