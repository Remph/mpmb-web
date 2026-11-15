<!--
  The start page's Settings on a phone (M13, mock-up pass 1, review 3 finding 08): house rules, look and language
  behind one button, because three buttons beside the title need two rows at 360 px. The same tiles as the Sheet
  menu's; house rules and Look open in this window's place, as there.
-->
<script lang="ts">
  import { fill } from '../i18n.ts';
  import type { Texts } from '../i18n.ts';
  import { homebrew } from '../homebrew/switches.svelte.ts';
  import { look } from '../look.svelte.ts';
  import { lookLine } from '../look.ts';
  import Modal from '../popups/Modal.svelte';
  import type { Session } from '../session.svelte.ts';
  import HomebrewWindow from './HomebrewWindow.svelte';
  import LookWindow from './LookWindow.svelte';

  interface Props {
    session: Session;
    toggleLanguage: () => void;
    onclose: () => void;
    t: Texts;
  }

  let { session, toggleLanguage, onclose, t }: Props = $props();

  let rules = $state(false);
  let looks = $state(false);
  const rulesOn = $derived(Object.values(homebrew.switches).filter(Boolean).length);
</script>

{#if rules}
  <HomebrewWindow {onclose} {t} />
{:else if looks}
  <LookWindow {onclose} {session} {t} />
{:else}
  <Modal title={t.settingsTitle} onescape={onclose} closeLabel={t.close}>
    <div class="tiles">
      <button type="button" class="tile" onclick={() => (rules = true)}>
        <b>{t.homebrewTitle}</b><small>{rulesOn ? fill(t.homebrewOnCount, { count: rulesOn }) : t.homebrewLine}</small>
      </button>
      <button type="button" class="tile" onclick={() => (looks = true)}>
        <b>{t.lookTitle}</b><small>{lookLine(look.current, t)}</small>
      </button>
      <!-- The other language's name in that language ("Deutsch"); a tap switches at once and the window stays. -->
      <button type="button" class="tile" onclick={toggleLanguage} aria-label={t.switchLanguageLabel}>
        <b lang={t.switchLanguage === 'English' ? 'en' : 'de'}>{t.switchLanguage}</b><small>{t.menuLanguageLine}</small>
      </button>
    </div>
  </Modal>
{/if}

<style>
  /* Like the Sheet menu's tiles: one per row on a phone, the title over a muted line. */
  .tiles {
    display: grid;
    gap: 0.5rem;
  }

  .tile {
    display: grid;
    align-content: center;
    gap: 0.125rem;
    min-height: 64px;
    padding: 0.5rem 0.875rem;
    border-radius: 0.75rem;
    text-align: left;
  }

  .tile b {
    font-weight: 700;
  }

  .tile small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }
</style>
