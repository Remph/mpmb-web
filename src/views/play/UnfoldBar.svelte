<!--
  Brings the folded top bar back: a pill at the end of the play view's tab row with the character's name,
  so it still says whose sheet this is. While a change is being saved, a ring pulses around the arrow (the bar's
  "Saved" is out of sight). In a narrow column only the round arrow shows.
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';

  interface Props {
    name: string;
    busy: boolean;
    onunfold: () => void;
    t: Texts;
  }

  let { name, busy, onunfold, t }: Props = $props();
</script>

<button type="button" class="unfold" title={t.unfoldBar} aria-label={`${t.unfoldBar}: ${name}`} onclick={onunfold}>
  <span class="arrow" class:busy aria-hidden="true">
    <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 9l6 6 6-6" /></svg>
  </span>
  <span class="name" aria-hidden="true">{name}</span>
</button>

<style>
  /*
   * The pill gives way first: it shrinks to its arrow (the name cut short) long before the tabs have to scroll,
   * so a wide name never hides the last tab (review of #56: "Notes" was out of sight in the 1440 px laptop's
   * middle column).
   */
  .unfold {
    flex: 0 1000 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 14rem;
    padding: 0 0.875rem 0 0.375rem;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
  }

  .unfold:not(:disabled):hover {
    background: var(--accent-soft);
    filter: brightness(0.97);
  }

  .arrow {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* Saving: a ring pulses around the arrow. */
  .arrow.busy {
    outline: 2px solid color-mix(in srgb, var(--accent) 35%, transparent);
    outline-offset: 2px;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      outline-color: var(--accent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .arrow.busy {
      animation: none;
    }
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The middle column of an iPad held upright: seven tabs need the room, so only the arrow. */
  @container (max-width: 560px) {
    .unfold {
      width: 44px;
      padding: 0;
      justify-content: center;
    }

    .name {
      display: none;
    }
  }
</style>
