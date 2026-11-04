<!--
  The line under the top bar after MPMB's import moved the character to a new sheet version (M11, Nick's pick A):
  how many entries changed, "See what changed", and ✕ to keep the update. After an undo it says the character
  stays on its old sheet and offers the update again.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { SheetUpdate } from '../../store/characters.ts';

  interface Props {
    update: SheetUpdate;
    t: Texts;
    onshow: () => void;
    onkeep: () => void;
    onagain: () => void;
  }
  let { update, t, onshow, onkeep, onagain }: Props = $props();
  const changed = $derived(
    update.changes ? counted(t.updLineChangedOne, t.updLineChanged, update.changes) : t.updLineNone,
  );
</script>

<div class="update" role="status">
  <span class="icon" aria-hidden="true">↻</span>
  {#if update.undone}
    <p>{fill(t.updUndoneLine, { from: update.from, to: update.to })}</p>
    <div class="buttons">
      <button type="button" onclick={onagain}>{fill(t.updAgain, { to: update.to })}</button>
    </div>
  {:else}
    <p><strong>{fill(t.updLine, { to: update.to })}</strong> {changed}</p>
    <div class="buttons">
      <button type="button" class="primary" onclick={onshow}>{t.updSee}</button>
      <button type="button" class="close" aria-label={t.updCloseLine} title={t.updCloseLine} onclick={onkeep}
        >✕</button
      >
    </div>
  {/if}
</div>

<style>
  .update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    margin-top: 0.75rem;
  }
  .icon {
    font-weight: 700;
    color: var(--accent);
  }
  p {
    flex: 1;
    min-width: 14rem;
    margin: 0;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  .close {
    min-width: 44px;
  }
</style>
