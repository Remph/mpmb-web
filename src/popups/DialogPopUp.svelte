<!--
  MPMB's custom dialogs (app.execDialog). The worker runs the dialog's handlers; this draws the
  description with the state it sent, keeps the player's input, and sends it back with each event.
-->
<script lang="ts">
  import type { DialogElement, DialogReply, DialogState, DialogView } from '../engine/host.ts';
  import type { Texts } from '../i18n.ts';
  import { findCloser } from './closer.ts';
  import { dialogTitle } from './labels.ts';
  import DialogItem from './DialogItem.svelte';
  import { alignTables } from './tables.ts';
  import Modal from './Modal.svelte';

  interface Props {
    view: DialogView;
    /** Whether the worker waits for an answer now (not while it runs the last event's handler). */
    waiting: boolean;
    t: Texts;
    answer: (reply: DialogReply) => void;
  }

  let { view, waiting, t, answer }: Props = $props();

  // The player's input lives here between events; each new view from the worker replaces it.
  const radioGroups = $derived.by(() => {
    const groups: Record<string, string[]> = {};
    const walk = (elements: DialogElement[] = []) =>
      elements.forEach((e) => {
        if (e.type === 'radio' && e.item_id) (groups[String(e.group_id ?? '')] ??= []).push(e.item_id);
        walk(e.elements);
      });
    walk(view.description.elements);
    return groups;
  });

  /**
   * One radio button per group is on. MPMB sometimes loads two (the units dialog loads "dot" and
   * "comma" both on for a metric sheet with a dot) and its commit reads the first, so the first wins.
   */
  const oneRadioPerGroup = (state: DialogState): DialogState => {
    const out = structuredClone(state);
    Object.values(radioGroups).forEach((ids) => {
      const on = ids.filter((id) => out[id] === true);
      on.slice(1).forEach((id) => (out[id] = false));
    });
    return out;
  };

  // The player's input lives here between events; each new view from the worker replaces it.
  let input: DialogState = $state({});
  $effect.pre(() => {
    input = oneRadioPerGroup(view.state);
  });

  const closer = $derived(findCloser(view.description.elements));

  const set = (id: string, value: unknown) => {
    input[id] = value;
  };
  const current = (): DialogState => $state.snapshot(input);
  const onevent = (id: string) => {
    if (waiting) answer({ type: 'event', id, state: current() });
  };
  const onclose = (result: string) => {
    if (waiting) answer({ type: 'close', result, state: current() });
  };
</script>

<Modal
  title={dialogTitle(String(view.description.name ?? ''))}
  widest
  onescape={() => onclose('cancel')}
  closeLabel={t.close}
>
  <div class="dialog" lang="en" aria-busy={!waiting} use:alignTables>
    {#each view.description.elements ?? [] as element, i (i)}
      <DialogItem {element} state={input} {view} {radioGroups} {t} {set} {onevent} {onclose} skip={closer} />
    {/each}
  </div>
  {#snippet actions()}
    {#if closer}
      <DialogItem element={closer} state={input} {view} {radioGroups} {t} {set} {onevent} {onclose} />
    {/if}
  {/snippet}
</Modal>

<style>
  .dialog {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    /* Acrobat's dialog font is small; this keeps MPMB's wide tables closer to their intended size. */
    font-size: 0.9375rem;
  }
</style>
