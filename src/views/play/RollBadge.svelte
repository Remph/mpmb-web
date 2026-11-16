<!--
  A number on the sheet that a tap rolls (M14's look, M17 for companions, Wild Shape forms and spells): the to-hit
  in the accent tint, damage in a quiet one with its type underneath. The Combat tab's own badges carry the
  advantage mark as well and stay there.
-->
<script lang="ts">
  interface Props {
    /** What a screen reader hears: "Roll Bite attack roll +4". */
    label: string;
    /** "+4", "1d6+2". */
    text: string;
    /** The damage type under the dice, or nothing. */
    small?: string;
    damage?: boolean;
    onroll: (button: HTMLButtonElement) => void;
  }

  let { label, text, small = '', damage = false, onroll }: Props = $props();
</script>

<button type="button" class="badge" class:damage aria-label={label} onclick={(ev) => onroll(ev.currentTarget)}
  >{text}{#if small}{' '}<small>{small}</small>{/if}</button
>

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    min-width: 3.5rem;
    min-height: 44px;
    padding: 0 0.5rem;
    border: 0;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font: inherit;
    font-size: 1.125rem;
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
  }

  .badge:hover,
  .badge:focus-visible {
    filter: brightness(0.95);
  }

  .damage {
    min-width: 5rem;
    background: var(--paper);
    color: var(--ink);
  }

  small {
    display: block;
    font-size: 0.6875rem;
    font-weight: 500;
  }
</style>
