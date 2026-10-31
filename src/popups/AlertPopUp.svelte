<!-- MPMB's app.alert: a message with OK, OK/Cancel, Yes/No or Yes/No/Cancel, maybe a check box. -->
<script lang="ts">
  import { ALERT_ANSWER, ALERT_BUTTONS } from '../engine/host.ts';
  import type { AlertReply, AlertRequest } from '../engine/host.ts';
  import type { Texts } from '../i18n.ts';
  import Modal from './Modal.svelte';

  interface Props {
    request: AlertRequest;
    t: Texts;
    answer: (reply: AlertReply) => void;
  }

  let { request, t, answer }: Props = $props();
  // The check box ("don't show again") starts as the script set it.
  // svelte-ignore state_referenced_locally
  let checked = $state(request.checkbox?.value ?? false);

  const buttons = $derived.by(() => {
    const ok = { answer: ALERT_ANSWER.ok, label: t.ok };
    const cancel = { answer: ALERT_ANSWER.cancel, label: t.cancel };
    const yes = { answer: ALERT_ANSWER.yes, label: t.yes };
    const no = { answer: ALERT_ANSWER.no, label: t.no };
    if (request.buttons === ALERT_BUTTONS.okCancel) return [cancel, ok];
    if (request.buttons === ALERT_BUTTONS.yesNo) return [no, yes];
    if (request.buttons === ALERT_BUTTONS.yesNoCancel) return [cancel, no, yes];
    return [ok];
  });

  /** Escape: Cancel where there is one, else No, else OK, as closing the window does in Acrobat. */
  const escapeAnswer = $derived(
    request.buttons === ALERT_BUTTONS.yesNo
      ? ALERT_ANSWER.no
      : request.buttons === ALERT_BUTTONS.ok
        ? ALERT_ANSWER.ok
        : ALERT_ANSWER.cancel,
  );

  const reply = (n: number) => answer(request.checkbox ? { answer: n, checkboxValue: checked } : { answer: n });
</script>

<Modal title={request.title || 'MPMB'} onescape={() => reply(escapeAnswer)} closeLabel={t.close}>
  <p class="message" lang="en">{request.message}</p>
  {#if request.checkbox}
    <label class="check">
      <input type="checkbox" bind:checked />
      <span lang="en">{request.checkbox.message || t.dontShowAgain}</span>
    </label>
  {/if}
  {#snippet actions()}
    {#each buttons as button, i (button.answer)}
      <button type="button" class:primary={i === buttons.length - 1} onclick={() => reply(button.answer)}>
        {button.label}
      </button>
    {/each}
  {/snippet}
</Modal>

<style>
  .message {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    margin-top: 0.75rem;
  }

  .check input {
    width: 1.25rem;
    height: 1.25rem;
  }
</style>
