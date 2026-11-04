<!--
  The homebrew window: house rules the app can add on top of MPMB's sheet, each with an on/off switch.
  They count for this browser (Nick, 2026-11-04) and stay in the app: neither the PDF export nor printing
  carries them. Opened from the start page and the play view's sheet menu.
-->
<script lang="ts">
  import type { Texts } from '../i18n.ts';
  import { HOMEBREW_KEYS, homebrew } from '../homebrew/switches.svelte.ts';
  import type { HomebrewKey } from '../homebrew/switches.svelte.ts';
  import Modal from '../popups/Modal.svelte';

  interface Props {
    onclose: () => void;
    t: Texts;
  }

  let { onclose, t }: Props = $props();

  const texts = (key: HomebrewKey): { title: string; line: string } =>
    ({
      ultCharges: { title: t.homebrewUltTitle, line: t.homebrewUltLine },
      noAmmo: { title: t.homebrewNoAmmoTitle, line: t.homebrewNoAmmoLine },
    })[key];
</script>

<Modal title={t.homebrewTitle} onescape={onclose} closeLabel={t.close} wide>
  <p class="intro">{t.homebrewIntro}</p>
  <ul>
    {#each HOMEBREW_KEYS as key (key)}
      {@const on = homebrew.switches[key]}
      <li>
        <span class="text" id={`homebrew-${key}`}><b>{texts(key).title}</b><small>{texts(key).line}</small></span>
        <!-- A switch, not a check box: it acts at once, nothing to save. The words say the state too. -->
        <button
          type="button"
          role="switch"
          class="switch"
          aria-checked={on}
          aria-labelledby={`homebrew-${key}`}
          onclick={() => homebrew.set(key, !on)}
          ><span class="track"><span class="knob"></span></span>{on ? t.switchOn : t.switchOff}</button
        >
      </li>
    {/each}
  </ul>
  {#snippet actions()}
    <button type="button" class="primary" onclick={onclose}>{t.done}</button>
  {/snippet}
</Modal>

<style>
  .intro {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.625rem 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .text {
    display: grid;
    gap: 0.125rem;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .switch {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
    min-width: 6rem;
    padding: 0 0.75rem;
    border-color: transparent;
    background: none;
    font-weight: 600;
  }

  .track {
    position: relative;
    width: 2.75rem;
    height: 1.5rem;
    border-radius: 0.75rem;
    background: var(--used);
    transition: background 0.15s;
  }

  .knob {
    position: absolute;
    top: 0.1875rem;
    left: 0.1875rem;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
    background: var(--surface);
    transition: transform 0.15s;
  }

  .switch[aria-checked='true'] {
    color: var(--accent);
  }

  .switch[aria-checked='true'] .track {
    background: var(--accent);
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(1.25rem);
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
