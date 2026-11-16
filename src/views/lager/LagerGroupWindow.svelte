<!--
  A group of the Lager (M16), from its ··· button: rename it, move it up or down the list (for everyone; Nick,
  2026-11-16), or remove it with all its items after asking once more, with how many items go with it.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { LAGER_LIMITS, movedGroup, type Lager, type LagerGroup, type Op } from '../../lager/lager.ts';

  interface Props {
    group: LagerGroup;
    /** How many items the group holds. */
    count: number;
    /** The Lager as it is now, for the group's place in the list. */
    lager: Lager;
    onsave: (ops: Op[]) => void;
    /** Sends a move at once; the window stays open for the next step. */
    onmove: (ops: Op[]) => void;
    /** No connection: a move would show and then fall back, so the buttons wait (like the panel's). */
    readonly: boolean;
    onclose: () => void;
    t: Texts;
  }

  let { group, count, lager, onsave, onmove, readonly, onclose, t }: Props = $props();

  const up = $derived(movedGroup(lager, group.id, -1));
  const down = $derived(movedGroup(lager, group.id, 1));
  let upButton: HTMLButtonElement | undefined = $state();
  let downButton: HTMLButtonElement | undefined = $state();

  /**
   * At the top or bottom the button just pressed turns disabled and drops the focus to the page (Firefox): hand it
   * to the other one, so a keyboard player stays in the window.
   */
  async function move(order: string[] | null, by: -1 | 1): Promise<void> {
    if (!order) return;
    onmove([{ op: 'orderGroups', ids: order }]);
    await tick();
    if (by < 0 && !up) downButton?.focus();
    if (by > 0 && !down) upButton?.focus();
  }

  const start = untrack(() => ({ ...group }));
  let name = $state(start.name);
  let sure = $state(false);

  function save(): void {
    const next = name.trim();
    if (next && next !== start.name) onsave([{ op: 'renameGroup', id: start.id, name: next }]);
    else onclose();
  }
</script>

<Modal title={group.name} onescape={onclose} closeLabel={t.close}>
  <form
    id="lager-group"
    onsubmit={(event) => {
      event.preventDefault();
      save();
    }}
  >
    <label class="field">
      <span>{t.lagerGroupName}</span>
      <input type="text" bind:value={name} maxlength={LAGER_LIMITS.groupName} required />
    </label>
    <div class="move" role="group" aria-labelledby="lager-group-place">
      <span id="lager-group-place">{t.lagerGroupPlace}</span>
      <button type="button" bind:this={upButton} disabled={readonly || !up} onclick={() => move(up, -1)}
        >{t.lagerMoveUp}</button
      >
      <button type="button" bind:this={downButton} disabled={readonly || !down} onclick={() => move(down, 1)}
        >{t.lagerMoveDown}</button
      >
    </div>
    {#if sure}
      <p class="ask" role="alert">{fill(t.lagerGroupRemoveAsk, { name: start.name, count })}</p>
    {/if}
  </form>

  {#snippet actions()}
    {#if sure}
      <button type="button" onclick={() => (sure = false)}>{t.cancel}</button>
      <button type="button" class="danger" onclick={() => onsave([{ op: 'removeGroup', id: start.id }])}
        >{t.lagerRemoveSure}</button
      >
    {:else}
      <button type="button" class="quiet remove" onclick={() => (sure = true)}>{t.lagerGroupRemove}</button>
      <button type="submit" form="lager-group" class="primary">{t.lagerSave}</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .field {
    display: grid;
    gap: 0.25rem;
  }

  .field > span {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  input {
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

  .move {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.875rem;
  }

  .move span {
    flex: 1 0 100%;
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .move button {
    flex: 1 1 0;
    padding: 0 0.75rem;
  }

  .ask {
    margin: 0.75rem 0 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
  }

  .remove {
    margin-right: auto;
  }
</style>
