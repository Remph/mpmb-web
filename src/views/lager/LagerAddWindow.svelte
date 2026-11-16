<!--
  "+ Add" in the Lager (M16; Nick: "we need to be able to add items"). A name, its group (or a new one), where it
  is or how many, and a note or the item's text. A name the count group has already counts up instead of making a
  second row ("Add 3 to Iron Ore"), so two players adding the same material don't end up with two lines.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { IN_LAGER, LAGER_LIMITS, sameItem, type GroupKind, type Lager, type Op } from '../../lager/lager.ts';
  import PlaceChips from './PlaceChips.svelte';

  interface Props {
    lager: Lager;
    /** The group to add to at first; null: the first one. */
    group: string | null;
    onadd: (ops: Op[]) => void;
    oncancel: () => void;
    t: Texts;
  }

  let { lager, group, onadd, oncancel, t }: Props = $props();

  /** The select's value for "New group …"; never an id the app makes (those are UUIDs). */
  const NEW_GROUP = 'new';

  let name = $state('');
  let groupId = $state(untrack(() => group ?? lager.groups[0]?.id ?? NEW_GROUP));
  let groupName = $state('');
  let kind = $state<GroupKind>('place');
  let place = $state(IN_LAGER);
  let count = $state(1);
  let note = $state('');

  const chosen = $derived(lager.groups.find((entry) => entry.id === groupId) ?? null);
  const kindNow = $derived(chosen?.kind ?? kind);
  /** Materials: the same name counts up the row that is there. */
  const same = $derived(chosen?.kind === 'count' && name.trim() ? sameItem(lager, chosen.id, name) : null);
  const howMany = $derived(Number.isSafeInteger(count) && count > 0 ? Math.min(count, LAGER_LIMITS.count) : 1);
  const ready = $derived(Boolean(name.trim()) && (groupId !== NEW_GROUP || Boolean(groupName.trim())));

  function add(): void {
    if (!ready) return;
    if (same) return onadd([{ op: 'count', id: same.id, by: howMany }]);
    const ops: Op[] = [];
    let target = groupId;
    if (!chosen) {
      target = crypto.randomUUID();
      ops.push({ op: 'addGroup', id: target, name: groupName.trim(), kind });
    }
    ops.push({
      op: 'add',
      id: crypto.randomUUID(),
      group: target,
      name: name.trim(),
      count: howMany,
      place: kindNow === 'place' ? place.trim() || IN_LAGER : '',
      note: note.trim(),
    });
    onadd(ops);
  }
</script>

<Modal title={t.lagerAddTitle} onescape={oncancel} closeLabel={t.close}>
  <form
    id="lager-add"
    onsubmit={(event) => {
      event.preventDefault();
      add();
    }}
  >
    <label class="field">
      <span>{t.lagerName}</span>
      <input type="text" bind:value={name} maxlength={LAGER_LIMITS.itemName} required />
    </label>
    {#if same}<p class="hint" role="status">{fill(t.lagerSameName, { name: same.name, count: same.count })}</p>{/if}

    <label class="field">
      <span>{t.lagerGroup}</span>
      <select bind:value={groupId}>
        {#each lager.groups as entry (entry.id)}
          <option value={entry.id}>{entry.name}</option>
        {/each}
        <option value={NEW_GROUP}>{t.lagerNewGroup}</option>
      </select>
    </label>

    {#if groupId === NEW_GROUP}
      <label class="field">
        <span>{t.lagerNewGroupName}</span>
        <input type="text" bind:value={groupName} maxlength={LAGER_LIMITS.groupName} required />
      </label>
      <fieldset>
        <legend>{t.lagerKind}</legend>
        <label class="radio"><input type="radio" bind:group={kind} value="place" /> {t.lagerKindPlace}</label>
        <label class="radio"><input type="radio" bind:group={kind} value="count" /> {t.lagerKindCount}</label>
      </fieldset>
    {/if}

    {#if kindNow === 'place'}
      <fieldset>
        <legend>{t.lagerPlace}</legend>
        <PlaceChips bind:value={place} {lager} {t} />
      </fieldset>
    {:else}
      <label class="field">
        <span>{t.lagerCount}</span>
        <input type="number" inputmode="numeric" min="1" max={LAGER_LIMITS.count} step="1" bind:value={count} />
      </label>
    {/if}

    {#if !same}
      <label class="field">
        <span>{t.lagerNote}</span>
        <textarea rows="3" bind:value={note} maxlength={LAGER_LIMITS.note}></textarea>
        <small>{t.lagerNoteHint}</small>
      </label>
    {/if}
  </form>

  {#snippet actions()}
    <button type="button" onclick={oncancel}>{t.cancel}</button>
    <button type="submit" form="lager-add" class="primary" disabled={!ready}
      >{same ? fill(t.lagerAddToCount, { count: howMany, name: same.name }) : t.lagerAddIt}</button
    >
  {/snippet}
</Modal>

<style>
  form {
    display: grid;
    gap: 0.875rem;
  }

  .field {
    display: grid;
    gap: 0.25rem;
  }

  .field > span,
  legend {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .field small,
  .hint {
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.375rem;
    padding: 0;
  }

  input[type='text'],
  input[type='number'],
  select,
  textarea {
    width: 100%;
    min-height: 44px;
    padding: 0 0.625rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
  }

  textarea {
    padding: 0.5rem 0.625rem;
    resize: vertical;
  }

  .radio {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
  }

  .radio input {
    width: 1.25rem;
    height: 1.25rem;
    accent-color: var(--accent);
  }
</style>
