<!--
  "Sync with your code" (M15, mock A): the player types the four words Remph gave them, once per device, and names
  the device for their other devices. The code goes to the service once; the device keeps only the token it gets.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import type { Session } from '../../session.svelte.ts';
  import { guessDeviceName } from '../../sync/account.ts';

  interface Props {
    session: Session;
    onclose: () => void;
    t: Texts;
  }

  let { session, onclose, t }: Props = $props();

  let code = $state('');
  // A first guess the player can change; read once, so switching the language doesn't overwrite what they typed.
  let name = $state(
    guessDeviceName(
      navigator.userAgent,
      navigator.maxTouchPoints,
      untrack(() => t.syncDeviceOn),
    ),
  );
  let busy = $state(false);
  let problem = $state('');
  let codeBox: HTMLInputElement | undefined = $state();

  $effect(() => {
    codeBox?.focus();
  });

  async function connect(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    busy = true;
    problem = '';
    const result = await session.connectSync(code, name.trim() || guessDeviceName('', 0));
    busy = false;
    if (result === 'ok') onclose();
    else problem = { wrong: t.syncWrongCode, wait: t.syncWait, offline: t.syncNoAnswer }[result];
  }
</script>

<Modal title={t.syncCodeTitle} onescape={onclose} closeLabel={t.close}>
  <form id="sync-code" onsubmit={connect}>
    <p class="lead">{t.syncCodeLead}</p>
    <label>
      <span>{t.syncCodeLabel}</span>
      <!-- Four words, not a password: shown as typed, no spell check or capitals that would change them. -->
      <input
        class="code"
        bind:this={codeBox}
        bind:value={code}
        placeholder={t.syncCodePlaceholder}
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? 'sync-code-problem' : undefined}
      />
    </label>
    <label>
      <span>{t.syncNameLabel}</span>
      <input bind:value={name} maxlength="80" autocomplete="off" />
    </label>
    {#if problem}<p class="problem" id="sync-code-problem" role="alert">{problem}</p>{/if}
  </form>
  {#snippet actions()}
    <button type="button" class="quiet" onclick={onclose}>{t.syncNotNow}</button>
    <button type="submit" form="sync-code" class="primary" disabled={busy || !code.trim()}>
      {busy ? t.syncConnecting : t.syncConnectButton}
    </button>
  {/snippet}
</Modal>

<style>
  .lead {
    margin: 0 0 1rem;
    color: var(--ink-muted);
  }

  label {
    display: grid;
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  label span {
    font-weight: 600;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    /* At least 1rem everywhere: phones zoom in on smaller text boxes and stay zoomed. */
    font: inherit;
    font-size: 1rem;
  }

  .code {
    font-size: 1.125rem;
    letter-spacing: 0.02em;
  }

  .problem {
    margin: 0;
    color: var(--danger);
    font-weight: 600;
  }
</style>
