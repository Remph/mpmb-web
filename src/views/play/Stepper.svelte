<!-- A number with − and + buttons, for pools (Lay on Hands), hit dice and item amounts. -->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';

  interface Props {
    /** The text between the buttons: "28 / 40". */
    text: string;
    /** What it counts, for screen readers. */
    name: string;
    canLess: boolean;
    canMore: boolean;
    disabled?: boolean;
    onless: () => void;
    onmore: () => void;
    /** When given, the number is a button too: a pool (Lay on Hands) asks how many points to use. */
    onpick?: () => void;
    /** The number button's label for screen readers. */
    pickLabel?: string;
    t: Texts;
  }

  let { text, name, canLess, canMore, disabled = false, onless, onmore, onpick, pickLabel, t }: Props = $props();
</script>

<span class="stepper" role="group" aria-label={name}>
  <button type="button" aria-label={`${name}: ${t.fewer}`} disabled={disabled || !canLess} onclick={onless}>−</button>
  {#if onpick}
    <button type="button" class="pick" aria-label={pickLabel} disabled={disabled || !canLess} onclick={onpick}
      ><b aria-live="polite">{text}</b></button
    >
  {:else}
    <b aria-live="polite">{text}</b>
  {/if}
  <button type="button" aria-label={`${name}: ${t.more}`} disabled={disabled || !canMore} onclick={onmore}>+</button>
</span>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  b {
    min-width: 3.5rem;
    text-align: center;
    font-size: 1.0625rem;
  }

  button {
    padding: 0;
    font-size: 1.25rem;
    line-height: 1;
  }

  /* The number keeps looking like a number: only a dashed underline says it can be tapped. */
  button.pick {
    padding: 0 0.25rem;
    border-color: transparent;
    background: none;
    font-size: inherit;
  }

  button.pick b {
    text-decoration: underline dashed var(--ink-muted);
    text-underline-offset: 0.25rem;
  }
</style>
