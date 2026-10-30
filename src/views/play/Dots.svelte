<!--
  Uses as dots: filled ones are left, hollow ones are used. Tapping a filled dot uses one, tapping a
  hollow one gives one back, so a mistap is undone by tapping again. Each dot is a 44 px target.
-->
<script lang="ts">
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';

  interface Props {
    total: number;
    used: number;
    /** What the dots count, for screen readers: "Channel Divinity". */
    name: string;
    disabled?: boolean;
    onchange: (used: number) => void;
    t: Texts;
  }

  let { total, used, name, disabled = false, onchange, t }: Props = $props();
  const left = $derived(Math.max(0, total - used));
</script>

<span class="dots" role="group" aria-label={fill(t.useDot, { name, count: used })}>
  {#each { length: total }, i (i)}
    <button
      type="button"
      class="dot"
      class:used={i >= left}
      aria-pressed={i >= left}
      aria-label={`${name} ${i + 1}`}
      {disabled}
      onclick={() => onchange(i < left ? used + 1 : used - 1)}
    ></button>
  {/each}
</span>

<style>
  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .dot {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
  }

  .dot::before {
    content: '';
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .dot.used::before {
    background: transparent;
    box-shadow: inset 0 0 0 2px var(--used);
  }

  .dot:not(:disabled):hover {
    background: var(--hover);
  }
</style>
