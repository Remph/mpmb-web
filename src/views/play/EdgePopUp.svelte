<!--
  Marks a roll with advantage or disadvantage: a skill, a saving throw, initiative or the attack rolls.
  The mark lives in the PDF's own pair of check boxes (src/play/edge.ts).
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { ARROW, edgeOf, markSteps } from '../../play/edge.ts';
  import type { Edge } from '../../play/edge.ts';
  import type { Advantage } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';

  interface Props {
    title: string;
    /** The roll as the sheet shows it: "DEX +4", "Save +7". */
    roll: string;
    state: Advantage;
    /** The prefix of MPMB's boxes: "Ste", "Str ST", "Init", "Att". */
    boxes: string;
    /** Instead of MPMB's boxes: a mark the app keeps itself (attacks against the character have none). */
    onmark?: (to: Edge) => void;
    /** Instead of the PDF note in the hint. */
    hint?: string;
    /** A line under the choices, when the mark means more than one roll ("every attack roll"). */
    note?: string;
    disabled: boolean;
    change: (steps: Step[]) => void;
    onclose: () => void;
    t: Texts;
  }

  let { title, roll, state, boxes, onmark, hint = '', note = '', disabled, change, onclose, t }: Props = $props();

  const CHOICES: [Edge, 'rollNormal' | 'rollAdvantage' | 'rollDisadvantage'][] = [
    ['', 'rollNormal'],
    ['adv', 'rollAdvantage'],
    ['dis', 'rollDisadvantage'],
  ];
  const current = $derived(edgeOf(state));

  function mark(to: Edge) {
    if (onmark) {
      if (to !== current) onmark(to);
      return onclose();
    }
    const steps = markSteps(state, boxes, to);
    if (steps.length) change(steps);
    onclose();
  }
</script>

<Modal {title} onescape={onclose} closeLabel={t.close}>
  {#if roll}<p class="roll">{roll}</p>{/if}
  <!-- Against the character the colours swap: enemies rolling with disadvantage is good news. -->
  <div class="choices" class:against={!!onmark}>
    {#each CHOICES as [to, text] (to)}
      <button type="button" class="choice {to}" aria-pressed={current === to} {disabled} onclick={() => mark(to)}
        >{#if to}<span aria-hidden="true">{ARROW[to]}</span>{/if}
        {t[text]}</button
      >
    {/each}
  </div>
  {#if note}<p class="hint">{note}</p>{/if}
  <p class="hint">{hint || t.edgeHint}</p>
</Modal>

<style>
  .roll {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }

  .choice.adv {
    color: var(--ok);
  }

  .choice.dis {
    color: var(--hp);
  }

  .choice[aria-pressed='true'] {
    border-color: currentColor;
    background: var(--accent-soft);
  }

  .choice.adv[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ok) 14%, var(--surface));
  }

  .choice.dis[aria-pressed='true'] {
    background: var(--hp-soft);
  }

  .against .choice.adv {
    color: var(--hp);
  }

  .against .choice.dis {
    color: var(--ok);
  }

  .against .choice.adv[aria-pressed='true'] {
    background: var(--hp-soft);
  }

  .against .choice.dis[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ok) 14%, var(--surface));
  }

  .choice:hover:not(:disabled, [aria-pressed='true']) {
    background: var(--hover);
  }

  .hint {
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
