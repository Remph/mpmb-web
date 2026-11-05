<!--
  "Change magic items" on the Inventory tab (session feedback, 2026-11-04): the character's magic items with
  Swap and Remove, and Add from MPMB's own list. The app writes the name into MPMB's magic item field, as
  typing it in Acrobat does, so MPMB fills in the rest and asks its own questions (which version, …).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { freeMagicRow, groupMagicItems, itemLine, magicItemField } from '../../build/magic-items.ts';
  import type { GearOption } from '../../build/gear.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts, UiKey } from '../../i18n.ts';
  import { readInventory } from '../../play/read.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import GearPick from '../build/GearPick.svelte';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    /** MPMB's lists from the open sheet (the Build screen's reading); null when the sheet can't give them. */
    load: () => Promise<BuilderInfo | null>;
    onclose: () => void;
    t: Texts;
  }

  let { fields, disabled, change, load, onclose, t }: Props = $props();

  const items = $derived(readInventory(fields).magicItems);
  const free = $derived(freeMagicRow(fields));

  // MPMB's list is read once, when the window opens.
  let info: BuilderInfo | null | undefined = $state(undefined);
  onMount(() => {
    void load().then((loaded) => (info = loaded));
  });

  const TYPE_TITLE: Record<string, UiKey> = {
    armor: 'magicTypeArmor',
    shield: 'magicTypeShield',
    weapon: 'magicTypeWeapon',
    potion: 'magicTypePotion',
    ring: 'magicTypeRing',
    rod: 'magicTypeRod',
    scroll: 'magicTypeScroll',
    staff: 'magicTypeStaff',
    wand: 'magicTypeWand',
    'wondrous item': 'magicTypeWondrous',
    other: 'magicTypeOther',
  };
  const groups = $derived(
    info
      ? groupMagicItems((info as BuilderInfo).gear.magicItems).map((group) => ({
          title: t[TYPE_TITLE[group.type] ?? 'magicTypeOther'],
          options: group.items.map((item): GearOption => ({
            name: item.name,
            line: itemLine(item, { attunement: t.magicItemAttunement, versions: t.magicItemVersions }),
            untrained: false,
            magic: false,
          })),
        }))
      : [],
  );

  /** The row the picker fills: an item's own row to swap it, or null to add into the first free row. */
  let picking: { row: number | null; current: string } | null = $state(null);

  function take(name: string) {
    const row = picking?.row ?? free;
    picking = null;
    // Cancelable: closing a pop-up MPMB opens while it applies the item ("which armor?" for adamantine
    // armor) means "not this item after all", so the row keeps what it had instead of a half-applied item.
    if (row !== null) change([{ edit: magicItemField(row), text: name, cancelable: true }]);
  }
</script>

<Modal title={t.magicItems} onescape={onclose} closeLabel={t.close} wide>
  <p class="line">{t.magicItemsLine}</p>
  <ul>
    {#each items as item (item.row)}
      <li>
        <span class="name"
          >{item.name}{#if item.attuned}<span class="tag">{t.attuned}</span>{/if}</span
        >
        <span class="buttons">
          <button
            type="button"
            disabled={disabled || !info}
            aria-label={fill(t.magicItemSwapOf, { name: item.name })}
            onclick={() => (picking = { row: item.row, current: item.name })}>{t.magicItemSwap}</button
          >
          <button
            type="button"
            class="danger"
            {disabled}
            aria-label={fill(t.magicItemRemoveOf, { name: item.name })}
            onclick={() => change([{ edit: magicItemField(item.row), text: '' }])}>{t.magicItemRemove}</button
          >
        </span>
      </li>
    {:else}
      <li class="muted">{t.noItems}</li>
    {/each}
  </ul>
  {#if info === undefined}
    <p class="line" aria-live="polite">{t.magicItemsLoading}</p>
  {:else if free === null}
    <p class="line">{t.magicItemsFull}</p>
  {/if}
  {#snippet actions()}
    <button type="button" onclick={onclose}>{t.close}</button>
    <button
      type="button"
      class="primary"
      disabled={disabled || !info || free === null}
      onclick={() => (picking = { row: null, current: '' })}>{t.magicItemAdd}</button
    >
  {/snippet}
</Modal>

{#if picking && info}
  <GearPick
    title={picking.row === null ? t.magicItemAddTitle : fill(t.magicItemSwapOf, { name: picking.current })}
    line={t.magicItemsPickLine}
    {groups}
    current={picking.current}
    magic={false}
    placeholder={t.magicItemPlaceholder}
    ontake={(name) => take(name)}
    onclose={() => (picking = null)}
    {t}
  />
{/if}

<style>
  .line {
    margin: 0 0 0.5rem;
    color: var(--ink-muted);
  }

  ul {
    margin: 0 0 0.5rem;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  li:first-child {
    border-top: 0;
  }

  .name {
    min-width: 0;
    font-weight: 700;
  }

  .tag {
    margin-left: 0.5rem;
    padding: 0 0.375rem;
    border-radius: 0.375rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .buttons {
    display: flex;
    gap: 0.375rem;
  }

  .muted {
    color: var(--ink-muted);
  }
</style>
