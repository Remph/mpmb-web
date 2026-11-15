<!--
  "Sync now" with auto sync off (Nick, 2026-11-15, mock A): before anything goes out, the characters changed on this
  device are listed, and the player says per character whether it goes out, stays here for now, or gives way to
  the synced copy. So tapping "Sync now" to fetch the other devices' changes never sends a try-out by accident.
  `again`: the player turns auto sync back on; "keep it here" isn't offered then, since the next round would send it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Session } from '../../session.svelte.ts';
  import type { SyncChoice, WaitingCharacter } from '../../sync/sync.svelte.ts';

  interface Props {
    session: Session;
    again?: boolean;
    onconfirm: (choices: Record<string, SyncChoice>) => void;
    onclose: () => void;
    t: Texts;
  }

  let { session, again = false, onconfirm, onclose, t }: Props = $props();

  let rows: WaitingCharacter[] = $state([]);
  let choices: Record<string, SyncChoice> = $state({});
  let loaded = $state(false);

  // Once, as the window opens: untracked, since waiting() reads the account, which a finished round replaces (a
  // re-run would reset the player's choices).
  $effect(() => {
    void untrack(() => session.sync.waiting())
      .catch(() => [])
      .then((found) => {
        rows = found;
        choices = Object.fromEntries(found.map((c) => [c.id, 'send' as SyncChoice]));
        loaded = true;
      });
  });

  /** "today, 19:42", before today a date and time ("14 Nov, 19:42"). */
  function when(iso: string): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === new Date().toDateString()
      ? `${t.syncToday}, ${time}`
      : date.toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  const anyKnown = $derived(rows.some((c) => c.known));
</script>

<Modal title={again ? t.syncAgainTitle : t.syncNowTitle} onescape={onclose} closeLabel={t.close}>
  <p class="lead">{again ? t.syncAgainLead : t.syncNowLead}</p>
  <ul aria-busy={!loaded}>
    {#each rows as row (row.id)}
      <li>
        <span class="who">
          <b>{row.name || t.unnamed}</b>
          <small>{fill(t.syncChangedWhen, { when: when(row.updated) })}</small>
        </span>
        <select bind:value={choices[row.id]} aria-label={fill(t.syncChoiceLabel, { name: row.name || t.unnamed })}>
          <option value="send">{t.syncSend}</option>
          {#if !again}<option value="keep">{t.syncKeep}</option>{/if}
          <!-- Only a character the service has can give way to its synced copy. -->
          {#if row.known}<option value="take">{t.syncTake}</option>{/if}
        </select>
      </li>
    {/each}
  </ul>
  {#if !again || anyKnown}<p class="hint">{again ? t.syncAgainHint : t.syncNowHint}</p>{/if}
  {#snippet actions()}
    <button type="button" class="quiet" onclick={onclose}>{t.syncNotNow}</button>
    <button type="button" class="primary" disabled={!loaded} onclick={() => onconfirm($state.snapshot(choices))}>
      {again ? t.syncAgainButton : t.syncNow}
    </button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    min-height: 56px;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  .who {
    display: grid;
    flex: 1 1 10rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  small,
  .hint {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .hint {
    margin: 0.5rem 0 0;
  }

  /* 1rem: phones zoom in on smaller text in a select and stay zoomed. */
  select {
    flex: 0 1 auto;
    max-width: 100%;
    min-height: 44px;
    padding: 0 0.5rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: 1rem;
  }
</style>
