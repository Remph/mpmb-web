<!--
  An item of the Lager (M16): its text, and every field to change, from a tap on its name. Save sends only what
  changed, and a count as the difference to what the window showed, so a change someone else made meanwhile stays.
  Remove asks once more on the same button row. Offline, the window shows the item read only.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { IN_LAGER, LAGER_LIMITS, type Lager, type LagerItem, type Op } from '../../lager/lager.ts';
  import PlaceChips from './PlaceChips.svelte';
  import { changedWhen } from './when.ts';
  import { ticking } from './now.svelte.ts';

  interface Props {
    item: LagerItem;
    lager: Lager;
    readonly: boolean;
    onsave: (ops: Op[]) => void;
    onclose: () => void;
    t: Texts;
  }

  let { item, lager, readonly, onsave, onclose, t }: Props = $props();

  // What the window opened with; the fields keep what the player types even when another device changes the item.
  const start = untrack(() => ({ ...item }));
  let name = $state(start.name);
  let groupId = $state(start.group);
  let place = $state(start.place || IN_LAGER);
  let count = $state(start.count);
  let note = $state(start.note);
  let sure = $state(false);
  const clock = ticking();

  // Most open an item to read its text: Save gets the focus, not the text box, so a tablet doesn't bring up its
  // keyboard over the text. After the window's own focus (showModal), hence the frame's wait.
  let saveButton: HTMLButtonElement | undefined = $state();
  $effect(() => {
    const frame = requestAnimationFrame(() => saveButton?.focus());
    return () => cancelAnimationFrame(frame);
  });

  const kind = $derived(lager.groups.find((group) => group.id === groupId)?.kind ?? 'place');

  function save(): void {
    if (readonly) return onclose();
    const set: Extract<Op, { op: 'set' }> = { op: 'set', id: start.id };
    if (name.trim() && name.trim() !== start.name) set.name = name.trim();
    if (groupId !== start.group) set.group = groupId;
    if (kind === 'place' && place.trim() !== (start.place || IN_LAGER)) set.place = place.trim() || IN_LAGER;
    if (note.trim() !== start.note.trim()) set.note = note.trim();
    const ops: Op[] = Object.keys(set).length > 2 ? [set] : [];
    const by = Number.isSafeInteger(count) ? Math.max(0, Math.min(count, LAGER_LIMITS.count)) - start.count : 0;
    if (kind === 'count' && by) ops.push({ op: 'count', id: start.id, by });
    if (ops.length) onsave(ops);
    else onclose();
  }
</script>

<Modal title={item.name} onescape={onclose} closeLabel={t.close}>
  <form
    id="lager-item"
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    {#if item.updated}
      <p class="hint">
        {fill(t.lagerChanged, { who: item.by || '?', when: changedWhen(item.updated, clock.now, t) })}
      </p>
    {/if}
    <label class="field">
      <span>{t.lagerNote}</span>
      <textarea rows="6" bind:value={note} maxlength={LAGER_LIMITS.note} disabled={readonly}></textarea>
    </label>

    {#if kind === 'place'}
      <fieldset>
        <legend>{t.lagerPlace}</legend>
        <PlaceChips bind:value={place} {lager} disabled={readonly} {t} />
      </fieldset>
    {:else}
      <label class="field">
        <span>{t.lagerCount}</span>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          max={LAGER_LIMITS.count}
          step="1"
          bind:value={count}
          disabled={readonly}
        />
      </label>
    {/if}

    <label class="field">
      <span>{t.lagerName}</span>
      <input type="text" bind:value={name} maxlength={LAGER_LIMITS.itemName} required disabled={readonly} />
    </label>
    <label class="field">
      <span>{t.lagerGroup}</span>
      <select bind:value={groupId} disabled={readonly}>
        {#each lager.groups as group (group.id)}
          <option value={group.id}>{group.name}</option>
        {/each}
      </select>
    </label>
  </form>

  {#snippet actions()}
    {#if !readonly}
      {#if sure}
        <button type="button" onclick={() => (sure = false)}>{t.cancel}</button>
        <button type="button" class="danger" onclick={() => onsave([{ op: 'remove', id: start.id }])}
          >{t.lagerRemoveSure}</button
        >
      {:else}
        <button type="button" class="quiet remove" onclick={() => (sure = true)}>{t.lagerRemove}</button>
        <button bind:this={saveButton} type="submit" form="lager-item" class="primary">{t.lagerSave}</button>
      {/if}
    {/if}
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

  /* Remove sits apart from Save, on the left. */
  .remove {
    margin-right: auto;
  }
</style>
