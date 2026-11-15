<!--
  The player's devices (M15, mock A's "Devices"): where their code is used and when each was last seen. Another
  device can be forgotten from here (a lost phone): it stops syncing at once. This device is forgotten from the
  start page's "Forget this device", which also takes the characters out of this browser.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Session } from '../../session.svelte.ts';

  interface Props {
    session: Session;
    onclose: () => void;
    t: Texts;
  }

  let { session, onclose, t }: Props = $props();
  const sync = $derived(session.sync);

  let loading = $state(true);
  let failed = $state(false);

  $effect(() => {
    void load();
  });

  async function load() {
    loading = true;
    failed = (await session.sync.listDevices()) === null;
    loading = false;
  }

  async function forget(id: number) {
    failed = !(await session.sync.forgetDevice(id));
  }

  const when = (at: number) =>
    new Date(at).toLocaleString(t.locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<Modal title={t.syncDevicesTitle} onescape={onclose} closeLabel={t.close}>
  <p class="lead">{t.syncDevicesLead}</p>
  {#if failed}<p class="problem" role="alert">{t.syncDevicesFailed}</p>{/if}
  {#if sync.devices.length}
    <ul aria-busy={loading}>
      {#each sync.devices as device (device.id)}
        <li>
          <span class="who">
            <b>{device.name}</b>
            <small>
              {#if device.current}<span class="tag">{t.syncThisDeviceTag}</span>{:else}{fill(t.syncSeen, {
                  when: when(device.lastSeen),
                })}{/if}
            </small>
          </span>
          {#if !device.current}
            <button
              type="button"
              class="quiet"
              aria-label={fill(t.syncForgetOneLabel, { device: device.name })}
              onclick={() => forget(device.id)}>{t.syncForgetOne}</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#snippet actions()}
    <button type="button" class="primary" onclick={onclose}>{t.done}</button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  .problem {
    color: var(--danger);
    font-weight: 600;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 56px;
    border-top: 1px solid var(--line);
  }

  .who {
    display: grid;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .tag {
    color: var(--ok);
    font-weight: 700;
  }
</style>
