<!--
  "+ Companion" and "Cast … again" (Remph picked the mock-ups' window and "the page stays", 2026-11-07).
  It lists every companion template the sheet's lists offer with the creatures it takes (MPMB's own Find
  Familiar and Pact of the Chain, the app's Find Steed, and whatever an add-on script adds), so nothing here
  names a creature. A creature that grows with its spell's level asks for the spell slot level and shows
  what that gives. Cast again (`page`), it lists only that page's template, with its creature and level picked.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { CompanionCreature, CompanionTemplate } from '../../engine/companion-options.ts';
  import { offeredLevels } from '../../play/companions.ts';
  import type { Companion } from '../../play/companions.ts';

  interface Props {
    /** null while the worker reads them. */
    templates: CompanionTemplate[] | null;
    /** The page to cast the spell again for; null to add a companion. */
    page: Companion | null;
    /** The character's highest spell slot level (0 for none). */
    highestSlot: number;
    onsummon: (creature: CompanionCreature, level: number | null) => void;
    onempty: () => void;
    onclose: () => void;
    t: Texts;
  }

  let { templates, page, highestSlot, onsummon, onempty, onclose, t }: Props = $props();

  /** How many creatures a template shows before "Show N more" (Find Familiar alone offers over a dozen). */
  const FIRST_SHOWN = 3;
  const EMPTY = 'empty';

  /** Templates whose spell the character has come first; cast again, only the page's own. */
  const shownTemplates = $derived.by(() => {
    const all = templates ?? [];
    if (page) return all.filter((tpl) => tpl.key === page.template);
    return [...all].sort((a, b) => Number(b.known) - Number(a.known));
  });
  const idOf = (tpl: CompanionTemplate, c: CompanionCreature): string => `${tpl.key}#${c.key}#${c.name}`;

  let picked = $state<string | null>(null);
  let level = $state<number | null>(null);
  let expanded = $state<Record<string, boolean>>({});

  // Once the lists are in: cast again, the page's creature and level; adding, the first creature of a template
  // whose spell the character has (a paladin's steed, a wizard's familiar), else nothing yet.
  $effect(() => {
    if (!templates || untrack(() => picked) !== null) return;
    const first = shownTemplates[0];
    if (page && first) {
      const same = first.creatures.find((c) => c.name.toLowerCase() === page.creature.toLowerCase());
      const creature = same ?? first.creatures[0];
      if (creature) choose(first, creature, page.hitDice);
    } else if (first?.known && first.creatures[0]) choose(first, first.creatures[0], null);
    reveal = untrack(() => picked);
  });

  /**
   * Cast again, the page's creature can be far down a long list (an owl among Find Familiar's thirty): the
   * window scrolls to it once, or it offers "Summon" with nothing visibly picked.
   */
  let reveal = $state<string | null>(null);
  const revealIf = (id: string) => (el: HTMLElement) => {
    if (reveal !== id) return;
    el.scrollIntoView({ block: 'center' });
    reveal = null;
  };

  function choose(tpl: CompanionTemplate, c: CompanionCreature, wanted: number | null) {
    picked = idOf(tpl, c);
    const levels = c.levels ? offeredLevels(c.levels, highestSlot) : [];
    level = levels.find((l) => l.level === wanted)?.level ?? levels[0]?.level ?? null;
    const index = tpl.creatures.indexOf(c);
    if (index >= FIRST_SHOWN) expanded = { ...expanded, [tpl.key]: true };
  }

  const pick = $derived.by(() => {
    for (const tpl of shownTemplates)
      for (const c of tpl.creatures) if (idOf(tpl, c) === picked) return { tpl, creature: c };
    return null;
  });
  const levels = $derived(pick?.creature.levels ? offeredLevels(pick.creature.levels, highestSlot) : []);
  const stats = $derived(levels.find((l) => l.level === level) ?? null);

  const sizes = $derived([
    t.companionSize0,
    t.companionSize1,
    t.companionSize2,
    t.companionSize3,
    t.companionSize4,
    t.companionSize5,
  ]);
  /** "Large · Celestial, Fey, Fiend · grows with the spell's level", or "… · AC 11 · HP 1". */
  function line(c: CompanionCreature): string {
    const size = c.size === null ? '' : (sizes[c.size] ?? '');
    const numbers = c.levels ? t.companionGrows : c.hp === null ? '' : fill(t.companionStats, { ac: c.ac, hp: c.hp });
    return [size, c.type, numbers].filter(Boolean).join(' · ');
  }

  const hp = $derived(stats?.hp ?? pick?.creature.hp ?? null);
  const label = $derived.by(() => {
    if (picked === EMPTY) return t.companionAddEmpty;
    if (!pick) return t.companionSummonPlain;
    if (page) return hp === null ? t.companionSummonPlain : fill(t.companionSummon, { hp });
    return fill(t.companionAddButton, { name: pick.creature.name });
  });
  const title = $derived(
    page && shownTemplates[0]?.spell
      ? fill(t.companionCastAgain, { spell: shownTemplates[0].spell })
      : t.companionAddTitle,
  );

  function confirm() {
    if (picked === EMPTY) return onempty();
    if (pick) onsummon(pick.creature, pick.creature.levels ? level : null);
  }
</script>

<Modal {title} onescape={onclose} closeLabel={t.close}>
  {#if templates === null}
    <p class="muted">{t.companionLoading}</p>
  {:else}
    {#if shownTemplates.length === 0}<p class="muted">{t.companionNone}</p>{/if}
    {#each shownTemplates as tpl (tpl.key)}
      {@const open = expanded[tpl.key] || tpl.creatures.length <= FIRST_SHOWN + 1}
      <fieldset>
        <legend>{tpl.menuName}</legend>
        {#each open ? tpl.creatures : tpl.creatures.slice(0, FIRST_SHOWN) as c (idOf(tpl, c))}
          {@const id = idOf(tpl, c)}
          <label class="opt" class:on={picked === id} {@attach revealIf(id)}>
            <input
              type="radio"
              name="companion"
              value={id}
              checked={picked === id}
              onchange={() => choose(tpl, c, level)}
            />
            <span class="name"
              ><b>{c.name}</b>{#if page && c.name.toLowerCase() === page.creature.toLowerCase()}
                <span class="tag">{t.companionNow}</span>{/if}</span
            >
            <small>{line(c)}</small>
            {#if c.note}<small class="note">{c.note}</small>{/if}
          </label>
          {#if picked === id && levels.length}
            <div class="levels">
              <span class="levels-title" id="slot-level">{t.companionSlotLevel}</span>
              <div class="seg" role="radiogroup" aria-labelledby="slot-level">
                {#each levels as l (l.level)}
                  <button type="button" role="radio" aria-checked={level === l.level} onclick={() => (level = l.level)}
                    >{l.level}</button
                  >
                {/each}
              </div>
              {#if stats}
                <p class="stats">
                  {fill(t.companionSlotStats, { ac: stats.ac, hp: stats.hp ?? '–', speed: stats.speed })}
                </p>
              {/if}
            </div>
          {/if}
        {/each}
        {#if !open}
          <button type="button" class="more" onclick={() => (expanded = { ...expanded, [tpl.key]: true })}>
            {fill(t.companionShowMore, { count: tpl.creatures.length - FIRST_SHOWN })} ▾
          </button>
        {/if}
      </fieldset>
    {/each}
    {#if !page}
      <fieldset>
        <legend>{t.companionOther}</legend>
        <label class="opt" class:on={picked === EMPTY}>
          <input
            type="radio"
            name="companion"
            value={EMPTY}
            checked={picked === EMPTY}
            onchange={() => (picked = EMPTY)}
          />
          <span class="name"><b>{t.companionEmptyPage}</b></span>
          <small>{t.companionEmptyLine}</small>
        </label>
      </fieldset>
    {/if}
  {/if}
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.cancel}</button>
    <button type="button" class="primary" disabled={picked === null} onclick={confirm}>{label}</button>
  {/snippet}
</Modal>

<style>
  fieldset {
    display: grid;
    gap: 0.375rem;
    margin: 0 0 0.75rem;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 0.375rem;
    padding: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
    font-weight: 700;
  }

  .muted {
    color: var(--ink-muted);
  }

  .opt {
    position: relative;
    display: grid;
    gap: 0.125rem;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--surface);
    line-height: 1.25;
    cursor: pointer;
  }

  /* The card is the radio button; the real one stays for keyboards and screen readers. */
  .opt input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .opt:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .opt.on {
    border: 2px solid var(--accent);
    padding: calc(0.5rem - 1px) calc(0.75rem - 1px);
    background: var(--accent-soft);
  }

  .opt small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
  }

  .tag {
    margin-left: 0.375rem;
    padding: 0 0.375rem;
    border-radius: 0.375rem;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.75rem;
    font-weight: 700;
    vertical-align: 1px;
  }

  .levels {
    display: grid;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    border-radius: 0.625rem;
    background: var(--accent-soft);
  }

  .levels-title {
    font-size: 0.9375rem;
    font-weight: 700;
  }

  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .seg button {
    min-width: 44px;
    min-height: 44px;
    font-weight: 700;
  }

  .seg button[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .stats {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .more {
    justify-self: start;
    min-height: 44px;
    border: 0;
    background: none;
    color: var(--accent);
    font-weight: 700;
  }
</style>
