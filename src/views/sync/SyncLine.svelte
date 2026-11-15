<!--
  The start page's sync line (M15, mock A): without a code, the way to type it; with one, whether everything is
  synced, on which devices, and the way to the devices list and to "Forget this device".
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import type { Session } from '../../session.svelte.ts';
  import SyncCodeWindow from './SyncCodeWindow.svelte';
  import SyncDevicesWindow from './SyncDevicesWindow.svelte';

  interface Props {
    session: Session;
    t: Texts;
  }

  let { session, t }: Props = $props();
  const sync = $derived(session.sync);

  let typing = $state(false);
  let listing = $state(false);

  const title = $derived(
    {
      off: t.syncOffTitle,
      synced: t.syncOnTitle,
      waiting: t.syncWaitingTitle,
      syncing: t.syncBusyTitle,
      offline: t.syncOfflineTitle,
    }[sync.state],
  );

  /** "Your characters are on Surface, iPad and this device · last change 19:42" */
  const line = $derived.by(() => {
    if (sync.state === 'offline') return t.syncOfflineLine;
    const names = sync.devices.map((device) => (device.current ? t.syncThisDevice : device.name));
    const parts = names.length
      ? [fill(t.syncDevicesLine, { devices: new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(names) })]
      : [];
    const last = Math.max(0, ...Object.values(sync.server).map((c) => c.updated));
    if (last) parts.push(fill(t.syncLastChange, { time: when(last) }));
    return parts.join(' · ');
  });

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
      <button type="button" onclick={() => (listing = true)}>{t.syncDevices}</button>
      <button type="button" class="quiet" onclick={() => session.forgetThisDevice()}>{t.syncForget}</button>
    {:else}
      <button type="button" onclick={() => (typing = true)}>{t.syncConnect}</button>
    {/if}
  </div>
</section>

{#if typing}
  <SyncCodeWindow {session} onclose={() => (typing = false)} {t} />
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
</style>
