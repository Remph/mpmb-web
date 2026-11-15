<!--
  The start page's sync line (M15, mock A): without a code, the way to type it; with one, whether everything is
  synced, on which devices, and the way to the devices list and to "Forget this device". Below, the switch for auto
  sync on this device; off, the line offers "Sync now" (Nick, 2026-11-15, mock A).
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Session } from '../../session.svelte.ts';
  import SyncCodeWindow from './SyncCodeWindow.svelte';
  import SyncDevicesWindow from './SyncDevicesWindow.svelte';
  import SyncNowWindow from './SyncNowWindow.svelte';
  import type { SyncChoice } from '../../sync/sync.svelte.ts';

  interface Props {
    session: Session;
    t: Texts;
  }

  let { session, t }: Props = $props();
  const sync = $derived(session.sync);

  let typing = $state(false);
  let listing = $state(false);
  /** The "Sync now" window: for a sync now, or before auto sync goes back on (`again`). */
  let asking: 'now' | 'again' | null = $state(null);

  /** Characters changed here and not sent yet. */
  const waiting = $derived(session.characters.filter((c) => sync.mark(c) === 'waiting').length);

  const title = $derived(
    {
      off: t.syncOffTitle,
      synced: t.syncOnTitle,
      waiting: t.syncWaitingTitle,
      syncing: t.syncBusyTitle,
      offline: t.syncOfflineTitle,
      manual: t.syncManualTitle,
    }[sync.state],
  );

  /** "Your characters are on Surface, iPad and this device · last change 19:42" */
  const line = $derived.by(() => {
    if (!sync.auto) {
      // "1 character changed here · last sync 19:42": what Sync now would deal with, and since when.
      const count =
        waiting === 0
          ? t.syncChangedNone
          : waiting === 1
            ? t.syncChangedOne
            : fill(t.syncChangedMany, { count: waiting });
      return sync.lastSync ? `${count} · ${fill(t.syncLastSync, { time: when(sync.lastSync) })}` : count;
    }
    if (sync.state === 'offline') return t.syncOfflineLine;
    const names = sync.devices.map((device) => (device.current ? t.syncThisDevice : device.name));
    const parts = names.length
      ? [fill(t.syncDevicesLine, { devices: new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(names) })]
      : [];
    const last = Math.max(0, ...Object.values(sync.server).map((c) => c.updated));
    if (last) parts.push(fill(t.syncLastChange, { time: when(last) }));
    return parts.join(' · ');
  });

  /** With changes here, the window asks what happens to each first; without, it just syncs. */
  function syncNow() {
    if (waiting) asking = 'now';
    else void sync.syncNow();
  }

  /** Back on: changes made meanwhile would go out at once, so the window asks about them first. */
  function toggle() {
    if (sync.auto) sync.setAuto(false);
    else if (waiting) asking = 'again';
    else sync.setAuto(true);
  }

  async function confirmed(choices: Record<string, SyncChoice>) {
    const again = asking === 'again';
    asking = null;
    await sync.syncNow(choices);
    if (again) sync.setAuto(true);
  }

  /** Today a time ("19:42"), before that a date and time. */
  function when(at: number): string {
    const date = new Date(at);
    const today = date.toDateString() === new Date().toDateString();
    return today
      ? date.toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
</script>

<section class="sync" data-state={sync.state} aria-labelledby="sync-title">
  <div class="text">
    <!-- Without a code there is no state to show, only the offer. -->
    <h2 id="sync-title">
      {#if sync.on}<span class="dot" aria-hidden="true"></span>{/if}{title}
    </h2>
    <p aria-live="polite">{sync.on ? line : t.syncOffLine}</p>
  </div>
  <div class="row">
    {#if sync.on}
      {#if !sync.auto}
        <button type="button" disabled={sync.state === 'syncing'} onclick={syncNow}>{t.syncNow}</button>
      {/if}
      <button type="button" onclick={() => (listing = true)}>{t.syncDevices}</button>
      <button type="button" class="quiet" onclick={() => session.forgetThisDevice()}>{t.syncForget}</button>
    {:else}
      <button type="button" onclick={() => (typing = true)}>{t.syncConnect}</button>
    {/if}
  </div>
  {#if sync.on}
    <div class="auto">
      <span class="auto-text" id="sync-auto"
        ><b>{t.syncAutoTitle}</b><small>{sync.auto ? t.syncAutoOnLine : t.syncAutoOffLine}</small></span
      >
      <!-- A switch, as in Homebrew rules: it acts at once (back on, after the window's question). -->
      <button
        type="button"
        role="switch"
        class="switch"
        aria-checked={sync.auto}
        aria-labelledby="sync-auto"
        onclick={toggle}
        ><span class="track"><span class="knob"></span></span>{sync.auto ? t.switchOn : t.switchOff}</button
      >
    </div>
  {/if}
</section>

{#if typing}
  <SyncCodeWindow {session} onclose={() => (typing = false)} {t} />
{/if}
{#if asking}
  <SyncNowWindow {session} again={asking === 'again'} onconfirm={confirmed} onclose={() => (asking = null)} {t} />
{/if}
{#if listing}
  <SyncDevicesWindow {session} onclose={() => (listing = false)} {t} />
{/if}

<style>
  .sync {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin: 0 0 1.25rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .text {
    flex: 1 1 16rem;
    min-width: 0;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  p {
    margin: 0.125rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* The dot says the state at a glance; the title says it in words, so colour is never the only sign. */
  .dot {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--ok);
  }

  [data-state='waiting'] .dot,
  [data-state='syncing'] .dot {
    background: var(--accent);
  }

  [data-state='offline'] .dot {
    background: var(--danger);
  }

  /* Auto sync off: nothing wrong and nothing on its way, so neither green nor the accent. */
  [data-state='manual'] .dot {
    background: var(--used);
  }

  .auto {
    display: flex;
    flex: 1 1 100%;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--line);
  }

  .auto-text {
    display: grid;
    /* Small enough that the switch stays beside the words down to 320 px, rather than alone under them. */
    flex: 1 1 8rem;
    min-width: 0;
  }

  .auto-text b {
    font-size: 0.9375rem;
  }

  .auto-text small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  /* The Homebrew rules switch (HomebrewWindow.svelte), the same look and size. */
  .switch {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
    min-width: 6rem;
    padding: 0 0.75rem;
    border-color: transparent;
    background: none;
    font-weight: 600;
  }

  .track {
    position: relative;
    width: 2.75rem;
    height: 1.5rem;
    border-radius: 0.75rem;
    background: var(--used);
    transition: background 0.15s;
  }

  .knob {
    position: absolute;
    top: 0.1875rem;
    left: 0.1875rem;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
    background: var(--surface);
    transition: transform 0.15s;
  }

  .switch[aria-checked='true'] {
    color: var(--accent);
  }

  .switch[aria-checked='true'] .track {
    background: var(--accent);
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(1.25rem);
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
