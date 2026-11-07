<!--
  The middle column's first tab: what a turn needs. Attacks (a to-hit number opens the advantage pop-up
  for every attack roll, the PDF's "Att Adv"/"Att Dis"), ammunition, spell slots, limited features, actions.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { ARROW, edgeOf, isAttackRoll } from '../../play/edge.ts';
  import { gearHref } from '../../build/choose-link.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Step } from '../../session.svelte.ts';
  import { readActionList, ruleFor, ruleIndex } from '../../play/actions.ts';
  import type { ActionItem, ActionRule } from '../../play/actions.ts';
  import {
    attacksPerAction,
    readAttacks,
    readLimitedFeatures,
    readRollMarks,
    readSpellSlotUse,
  } from '../../play/read.ts';
  import type { LimitedFeature } from '../../play/read.ts';
  import { recoveryText } from '../../play/labels.ts';
  import { slotClicks, usedText } from '../../play/rules.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import { homebrew } from '../../homebrew/switches.svelte.ts';
  import { ultLines } from '../../homebrew/ult.ts';
  import type { UltCharges } from '../../homebrew/ult.ts';
  import AmmoPanel from './AmmoPanel.svelte';
  import Dots from './Dots.svelte';
  import EdgePopUp from './EdgePopUp.svelte';
  import NumberPad from './NumberPad.svelte';
  import Stepper from './Stepper.svelte';

  interface Props {
    fields: FieldViews;
    /** For the "Change weapons" link to the Build screen's "Armour & weapons" step. */
    characterId: string;
    disabled: boolean;
    change: (steps: Step[]) => void;
    /** The ult (homebrew), or null while its switch is off: a tile among the actions if the player put it there. */
    ult?: UltCharges | null;
    t: Texts;
  }

  let { fields, characterId, disabled, change, ult = null, t }: Props = $props();

  const attacks = $derived(readAttacks(fields));
  const perAction = $derived(attacksPerAction(fields));
  const slots = $derived(readSpellSlotUse(fields));
  const features = $derived(readLimitedFeatures(fields));
  const actions = $derived(readActionList(fields));
  const rules = $derived(ruleIndex(fields));
  const attackMark = $derived(readRollMarks(fields).attacks);
  const attackEdge = $derived(edgeOf(attackMark));
  const edgeLabel = (e: 'adv' | 'dis'): string => (e === 'adv' ? t.advantage : t.disadvantage);

  /** The to-hit button that opened the advantage pop-up: focus goes back there when it closes. */
  let markFrom: HTMLButtonElement | null = $state(null);
  let marking = $state(false);
  function openMark(button: HTMLButtonElement) {
    markFrom = button;
    marking = true;
  }
  async function closeMark() {
    marking = false;
    await tick();
    markFrom?.focus();
    markFrom = null;
  }

  const setUsed = (feature: LimitedFeature, used: number) =>
    change([{ edit: `Limited Feature Used ${feature.row}`, text: usedText(used) }]);

  /** The pool whose number pad is open: Lay on Hands heals 5 or 10 points at a time, too many taps on −. */
  let padFor: LimitedFeature | null = $state(null);
  function usePool(amount: number) {
    const feature = padFor;
    padFor = null;
    if (feature?.max != null) setUsed(feature, Math.min(feature.max, feature.used + amount));
  }

  function setSlots(boxes: string[], used: number) {
    change(slotClicks(fields, boxes, used).map((click) => ({ click })));
  }

  // The Actions card (session feedback, 2026-11-04): chips by kind, the basic actions folded away, and a tap
  // on an action opens its rule text under its row. One rule open at a time.
  interface ActionGroup {
    kind: 'action' | 'bonus' | 'reaction';
    label: string;
    items: { item: ActionItem; rule: ActionRule | null; ult?: boolean }[];
    basic: string[];
  }
  /** The ult's tile, first in its row: the one action the player waits a whole fight for. */
  const ultTile = $derived.by(() => {
    if (!ult || ult.kind === 'none') return null;
    const lines = ultLines(ult);
    const name = ult.name || t.ultEditTitle;
    const full = ult.charges >= ult.max;
    return {
      kind: ult.kind,
      full,
      entry: {
        item: { name, note: full ? t.ultReady : `${ult.charges}/${ult.max}`, from: [] },
        rule: lines.length ? { title: name, source: t.homebrewSource, lines } : null,
        ult: true,
      },
    };
  });
  const groups = $derived(
    (
      [
        ['action', t.action, actions.action, actions.basic.filter((b) => b !== 'Opportunity Attack')],
        ['bonus', t.bonusAction, actions.bonusAction, []],
        ['reaction', t.reaction, actions.reaction, actions.basic.filter((b) => b === 'Opportunity Attack')],
      ] as const
    )
      .map(([kind, label, items, basic]): ActionGroup => ({
        kind,
        label,
        items: [
          ...(ultTile?.kind === kind ? [ultTile.entry] : []),
          ...items.map((item) => ({ item, rule: ruleFor(rules, item) })),
        ],
        basic: [...basic],
      }))
      .filter((group) => group.items.length || group.basic.length),
  );
  const anyRule = $derived(groups.some((g) => g.items.some((i) => i.rule)));
  let ruleOpen: string | null = $state(null);
  let basicOpen = $state(false);
  const ruleKey = (group: ActionGroup, i: number): string => `${group.kind}-${i}`;
  const POOL_STEP = 1;
</script>

<section class="panel" aria-labelledby="attacks-title">
  <div class="head">
    <h2 id="attacks-title">{t.attacks}</h2>
    {#if Number(perAction) > 1}<span class="muted">{fill(t.attacksPerAction, { count: perAction })}</span>{/if}
    <a class="change" href={gearHref(characterId)}>{t.combatChangeWeapons}</a>
  </div>
  {#each attacks as attack (attack.row)}
    <div class="attack">
      <span class="name">{attack.name}</span>
      <span class="hit">
        {#if isAttackRoll(attack.toHit)}
          <button
            type="button"
            class="badge"
            aria-haspopup="dialog"
            aria-label={`${fill(t.attackRollsOf, { name: attack.name })} ${attack.toHit}${attackEdge ? `, ${edgeLabel(attackEdge)}` : ''}`}
            onclick={(ev) => openMark(ev.currentTarget)}
            >{attack.toHit}
            {#if attackEdge}<small class="edge {attackEdge}" aria-hidden="true"
                >{ARROW[attackEdge]} {edgeLabel(attackEdge)}</small
              >{/if}</button
          >
        {:else if attack.toHit}
          <!-- A saving throw DC ("DC 14"): no attack roll, so no advantage mark and no pop-up. -->
          <span class="badge">{attack.toHit}</span>
        {/if}
        {#if attack.damage}
          <span class="badge damage">{attack.damage} <small>{attack.damageType}</small></span>
        {/if}
      </span>
      <span class="muted">{[attack.range, attack.description].filter(Boolean).join(', ')}</span>
    </div>
  {:else}
    <p class="muted">{t.noAttacks}</p>
  {/each}
</section>

{#if marking}
  <EdgePopUp
    title={t.attackRolls}
    roll=""
    state={attackMark}
    boxes="Att"
    note={t.attackRollsNote}
    {disabled}
    {change}
    onclose={() => void closeMark()}
    {t}
  />
{/if}

<!-- Hidden for tables that don't count ammunition (homebrew switch); MPMB's counters stay as they are. -->
{#if !homebrew.switches.noAmmo}
  <AmmoPanel {fields} {disabled} {change} {t} />
{/if}

{#if slots.length}
  <section class="panel" aria-labelledby="slots-title">
    <h2 id="slots-title">{t.spellSlots}</h2>
    {#each slots as level (level.level)}
      <div class="uses">
        <span class="name"
          >{fill(t.slotLevel, { count: level.level })}
          <small>{fill(t.slotsLeft, { left: level.total - level.used, total: level.total })}</small></span
        >
        <Dots
          total={Math.min(level.total, level.boxes.length)}
          used={level.used}
          name={`${t.spellSlots} ${fill(t.slotLevel, { count: level.level })}`}
          {disabled}
          onchange={(used) => setSlots(level.boxes, used)}
          {t}
        />
      </div>
    {/each}
  </section>
{/if}

{#if features.length}
  <section class="panel" aria-labelledby="features-title">
    <div class="head">
      <h2 id="features-title">{t.limitedFeatures}</h2>
      <span class="muted">{t.tapToUse}</span>
    </div>
    {#each features as feature (feature.row)}
      <div class="uses">
        <span class="name">{feature.name} <small>{recoveryText(feature.recovery, t)}</small></span>
        {#if feature.max === null}
          <span class="muted">{feature.maxText}</span>
        {:else if feature.pool}
          <Stepper
            text={fill(t.poolLeft, { left: feature.max - feature.used, total: feature.max })}
            name={feature.name}
            canLess={feature.used < feature.max}
            canMore={feature.used > 0}
            {disabled}
            onless={() => setUsed(feature, feature.used + POOL_STEP)}
            onmore={() => setUsed(feature, feature.used - POOL_STEP)}
            onpick={() => (padFor = feature)}
            pickLabel={fill(t.poolUseTitle, { name: feature.name })}
            {t}
          />
        {:else}
          <Dots
            total={feature.max}
            used={feature.used}
            name={feature.name}
            {disabled}
            onchange={(used) => setUsed(feature, used)}
            {t}
          />
        {/if}
      </div>
    {/each}
  </section>
{/if}

{#if padFor?.max != null}
  <NumberPad
    title={fill(t.poolUseTitle, { name: padFor.name })}
    hint={fill(t.poolUseHint, { left: padFor.max - padFor.used, total: padFor.max })}
    applyLabel={t.poolUse}
    onapply={usePool}
    onclose={() => (padFor = null)}
    {t}
  />
{/if}

{#if groups.length}
  <section class="panel" aria-labelledby="actions-title">
    <div class="head">
      <h2 id="actions-title">{t.actions}</h2>
      {#if anyRule}<span class="muted">{t.actionsTapToRead}</span>{/if}
    </div>
    {#each groups as group (group.kind)}
      {@const shown = group.items.findIndex((_, i) => ruleOpen === ruleKey(group, i))}
      {@const rule = shown >= 0 ? group.items[shown]?.rule : null}
      <div class="group {group.kind}">
        <span class="kind">{group.label}</span>
        <div class="chips">
          {#each group.items as { item, rule: itemRule, ult: isUlt }, i (i)}
            {#if itemRule}
              <button
                type="button"
                class="chip"
                class:ult={isUlt}
                class:ready={isUlt && ultTile?.full}
                aria-expanded={ruleOpen === ruleKey(group, i)}
                aria-controls={`rule-${group.kind}`}
                aria-label={fill(t.actionRuleOf, {
                  // The ult's note is its charges, which its own card reads out; the name is what it is.
                  name: item.note && !isUlt ? `${item.name} (${item.note})` : item.name,
                })}
                onclick={() => (ruleOpen = ruleOpen === ruleKey(group, i) ? null : ruleKey(group, i))}
                >{item.name}{#if item.note}<small>{item.note}</small>{/if}</button
              >
            {:else}
              <span class="chip" class:ult={isUlt} class:ready={isUlt && ultTile?.full}
                >{item.name}{#if item.note}<small>{item.note}</small>{/if}</span
              >
            {/if}
          {/each}
          {#if group.kind === 'action' && group.basic.length}
            {#if basicOpen}
              {#each group.basic as name (name)}<span class="chip basic">{name}</span>{/each}
            {/if}
            <button type="button" class="chip more" aria-expanded={basicOpen} onclick={() => (basicOpen = !basicOpen)}
              >{basicOpen ? t.basicActionsHide : fill(t.basicActionsShow, { count: group.basic.length })}</button
            >
          {:else}
            {#each group.basic as name (name)}<span class="chip basic">{name}</span>{/each}
          {/if}
        </div>
        {#if rule}
          <div class="rule" id={`rule-${group.kind}`}>
            <b
              >{rule.title}{#if rule.source}{' '}<small>· {rule.source}</small>{/if}</b
            >
            {#each rule.lines as line, i (i)}<p>{line}</p>{/each}
          </div>
        {/if}
      </div>
    {/each}
  </section>
{/if}

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  /* A quiet way to the Build step: the tab's main actions are the uses below. */
  .change {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    margin-left: auto;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .change:hover {
    background: var(--accent-soft);
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .muted,
  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 400;
  }

  p {
    margin: 0;
  }

  .attack {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.125rem 0.75rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }

  .attack:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .attack .name {
    font-size: 1.0625rem;
    font-weight: 800;
  }

  .hit {
    grid-row: span 2;
    align-self: center;
    display: flex;
    gap: 0.375rem;
  }

  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 3.5rem;
    min-height: 44px;
    padding: 0 0.5rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 1.125rem;
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
  }

  /* The to-hit number is a button (the advantage pop-up) that keeps the badge's look. */
  button.badge {
    border: 0;
    font: inherit;
    font-size: 1.125rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--accent);
  }

  button.badge:not(:disabled):hover,
  button.badge:focus-visible {
    background: var(--accent-soft);
    filter: brightness(0.95);
  }

  /* Under the number, like the damage type under the damage. */
  .badge .edge {
    color: var(--ok);
    font-weight: 700;
  }

  .badge .edge.dis {
    color: var(--hp);
  }

  .badge.damage {
    min-width: 6rem;
    background: var(--paper);
    color: var(--ink);
  }

  .badge small {
    display: block;
    font-size: 0.6875rem;
    font-weight: 500;
  }

  .uses {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.125rem 0;
    border-top: 1px solid var(--line);
  }

  .uses:first-of-type {
    border-top: 0;
  }

  .uses .name {
    min-width: 0;
    font-weight: 700;
    line-height: 1.2;
  }

  .uses small {
    display: block;
    font-size: 0.8125rem;
  }

  /*
   * Actions: one row per kind, the kind's name above, its actions as even tiles tinted in the kind's colour
   * (Remph picked the tiles, 2026-11-04). Action purple, bonus action amber, reaction teal: the stat cards'
   * colour family; every name and note keeps 4.5:1 on its tint in both themes.
   */
  .group {
    --k: #4b3fa0;
    --ks: #ece9fa;
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    gap: 0.25rem 0.5rem;
    align-items: start;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  .group.bonus {
    --k: #8a5300;
    --ks: #fbf0da;
  }

  .group.reaction {
    --k: #0d6767;
    --ks: #ddf2f0;
  }

  @media (prefers-color-scheme: dark) {
    .group {
      --k: #b3aaf5;
      --ks: #2c2843;
    }

    .group.bonus {
      --k: #f2c066;
      --ks: #33290f;
    }

    .group.reaction {
      --k: #7fd6d3;
      --ks: #14302f;
    }
  }

  .head + .group {
    padding-top: 0;
    border-top: 0;
  }

  /* Beside the tiles, level with the first row; above them in a narrow column (below). */
  .kind {
    padding-top: 0.8125rem;
    color: var(--k);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .chips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.25rem;
  }

  /* Compact (Remph, 2026-11-04): one 44 px line, the note right after the name, wrapping only when long. */
  .chip {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    align-items: baseline;
    gap: 0 0.25rem;
    min-height: 44px;
    padding: 0.375rem 0.625rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    background: var(--ks);
    color: var(--ink);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 700;
    line-height: 1.2;
    text-align: left;
  }

  .chip small {
    color: var(--k);
    font-size: 0.75rem;
    font-weight: 500;
  }

  button.chip:not(:disabled):hover {
    background: var(--ks);
    border-color: var(--k);
  }

  /* The open one: filled in the kind's colour, its rule right under the row. */
  button.chip:not(.more)[aria-expanded='true'],
  button.chip:not(.more)[aria-expanded='true']:not(:disabled):hover {
    background: var(--k);
    color: var(--surface);
  }

  button.chip:not(.more)[aria-expanded='true'] small {
    color: var(--surface);
  }

  /*
   * The ult: a ring in the kind's colour sets it apart from the sheet's actions, and its charges ride along
   * as the note. Full, the ring turns the app's accent and the note a "Ready" pill, as on the ult card, so
   * it shows from across the table. A shadow, not a wider border: the tile keeps its size.
   */
  .chip.ult {
    border-color: var(--k);
  }

  .chip.ult.ready:not([aria-expanded='true']) {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .chip.ult.ready:not([aria-expanded='true']) small {
    padding: 0 0.375rem;
    border-radius: 1rem;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }

  /* What every creature can do: quieter than the character's own. */
  .chip.basic {
    border-color: var(--line);
    background: none;
    color: var(--ink-muted);
    font-weight: 500;
  }

  .chip.more,
  .chip.more:not(:disabled):hover {
    border: 1px dashed var(--line);
    background: none;
    color: var(--accent);
  }

  .rule {
    grid-column: 1 / -1;
    padding: 0.625rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--paper);
    font-size: 0.9375rem;
    line-height: 1.4;
  }

  .rule p {
    margin: 0.25rem 0 0;
  }

  @container (max-width: 520px) {
    .group {
      grid-template-columns: minmax(0, 1fr);
    }

    .kind {
      padding-top: 0;
    }
  }
</style>
