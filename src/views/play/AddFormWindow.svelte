<!--
  "+ Form" in the companion bar's Wild Shape row (Remph picked A, 2026-11-08): the beasts MPMB's own "Add Wild
  Shape" menu offers, grouped by challenge rating, the druid's own limit first. A tap adds the beast through
  that menu; the window stays open, so several forms go in one after the other, and a known one is ticked.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { withinLimits } from '../../play/wild-shapes.ts';
  import type { Beast, FormLimits } from '../../play/wild-shapes.ts';

  interface Props {
    /** null while the worker reads them. */
    beasts: Beast[] | null;
    /** The names of the forms on the sheet, as written there. */
    known: string[];
    limits: FormLimits;
    /** MPMB's line about the limits ("CR 1 or lower"), shown as written. */
    limitsText: string;
    /** The beast being added right now, if any: its button waits. */
    adding: string | null;
    disabled: boolean;
    onadd: (beast: Beast) => void;
    onclose: () => void;
    t: Texts;
  }

  let { beasts, known, limits, limitsText, adding, disabled, onadd, onclose, t }: Props = $props();

  let search = $state('');
  let showAll = $state(false);
  let searchBox = $state<HTMLInputElement>();

  /*
   * The window opens with the focus in its first field, the search box. On a touch screen (the iPad) that
   * brings up the keyboard over half the beasts, though most players tap a beast without searching: give the
   * focus back once the window is open. A tap on the box still opens the keyboard.
   */
  $effect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === searchBox) searchBox?.blur();
    });
    return () => cancelAnimationFrame(frame);
  });

  const knownLower = $derived(new Set(known.map((name) => name.toLowerCase())));
  const isKnown = (beast: Beast): boolean => knownLower.has(beast.name.toLowerCase());
  const hasLimits = $derived(limits.maxChallenge !== null || limits.noFly);

  /** Groups by challenge rating ("CR 1/4"), lowest first; creatures from an add-on's own group come last. */
  const groups = $derived.by(() => {
    const words = search.trim().toLowerCase();
    const shown = (beasts ?? []).filter(
      (b) => (showAll || withinLimits(b, limits)) && (!words || b.name.toLowerCase().includes(words)),
    );
    const byGroup = new Map<string, { title: string; order: number; beasts: Beast[] }>();
    for (const beast of shown) {
      const id = beast.group ? `group:${beast.group}` : `cr:${beast.challenge}`;
      const entry = byGroup.get(id) ?? {
        title: beast.group || fill(t.formChallenge, { cr: beast.challenge || '?' }),
        // Add-on groups after every challenge rating (the menu has them below a divider too).
        order: beast.group ? 1000 : beast.challengeValue,
        beasts: [],
      };
      entry.beasts.push(beast);
      byGroup.set(id, entry);
    }
    return [...byGroup.values()]
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
      .map((g) => ({ ...g, beasts: g.beasts.sort((a, b) => a.name.localeCompare(b.name)) }));
  });

  const knownLine = $derived(
    limits.known !== null
      ? fill(t.formAddKnown, { known: known.length, max: limits.known })
      : fill(t.formAddCount, { known: known.length }),
  );
</script>

<Modal title={t.formAddTitle} onescape={onclose} closeLabel={t.close} wide>
  <p class="intro">
    <b>{knownLine}</b>
    {#if limitsText}{fill(t.formAddLimits, { limits: limitsText })}{/if}
    {t.formAddHint}
  </p>
  <input
    class="search"
    type="search"
    bind:this={searchBox}
    bind:value={search}
    placeholder={t.formSearch}
    aria-label={t.formSearch}
  />
  {#if hasLimits}
    <label class="all"><input type="checkbox" bind:checked={showAll} /> {t.formShowAll}</label>
  {/if}

  {#if beasts === null}
    <p class="muted">{t.companionLoading}</p>
  {:else if groups.length === 0}
    <p class="muted">{t.formNoneFound}</p>
  {:else}
    {#each groups as group (group.title)}
      <h3>{group.title}</h3>
      <div class="beasts">
        {#each group.beasts as beast (beast.name)}
          {@const ticked = isKnown(beast)}
          <button
            type="button"
            class="beast"
            class:known={ticked}
            aria-pressed={ticked}
            disabled={disabled || ticked || adding !== null}
            aria-busy={adding === beast.name}
            onclick={() => onadd(beast)}
          >
            {#if ticked}<span class="tick" aria-hidden="true">✓</span>{/if}{beast.name}
          </button>
        {/each}
      </div>
    {/each}
  {/if}

  {#snippet actions()}
    <button type="button" class="primary" onclick={onclose}>{t.done}</button>
  {/snippet}
</Modal>

<style>
  .intro {
    margin: 0 0 0.625rem;
    line-height: 1.4;
  }

  .search {
    width: 100%;
    min-height: 44px;
    /* At least 16 px: phones zoom in on smaller text boxes and stay zoomed. */
    font-size: 1rem;
  }

  .all {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }

  h3 {
    margin: 0.75rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .beasts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .beast {
    min-height: 44px;
    padding: 0 0.75rem;
  }

  /* Known: ticked and marked, not a dimmed "can't" button, since it is the good state. */
  .beast.known,
  .beast.known:disabled {
    border: 2px solid var(--accent);
    background: var(--accent-soft);
    color: var(--ink);
    font-weight: 700;
    opacity: 1;
  }

  /* A margin, not a space: Svelte trims the space at the end of the span. */
  .tick {
    margin-right: 0.25rem;
  }

  .beast[aria-busy='true'] {
    border-style: dashed;
  }

  .muted {
    color: var(--ink-muted);
  }
</style>
