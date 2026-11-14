<!--
  The About window (playtest 2026-11-14, note 4): what MPMB Web is, thanks to the group that played the first
  sessions with it, and the credits the app has to show anyway (MPMB, the SRD's CC-BY-4.0 attribution, the
  GPL source of this exact build). Opened from the play view's sheet menu and from the start page. The
  players' first names appear here and nowhere else in the repo (Remph's exception, 2026-11-14).
-->
<script lang="ts">
  import { fill } from '../i18n.ts';
  import type { Texts } from '../i18n.ts';
  import { MPMB_DOWNLOAD, MPMB_PATREON } from '../mpmb-links.ts';
  import Modal from '../popups/Modal.svelte';
  import { BUILD, SOURCE_URL, sourceUrl } from '../version.ts';

  interface Props {
    onclose: () => void;
    t: Texts;
  }

  let { onclose, t }: Props = $props();

  const builtOn = $derived(
    BUILD.date &&
      new Date(`${BUILD.date}T12:00:00`).toLocaleDateString(t.locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
  );
</script>

<Modal title={t.aboutTitle} onescape={onclose} closeLabel={t.close} wide>
  <p class="lead">{t.lead} {t.status}</p>

  <section class="thanks" aria-labelledby="about-thanks">
    <h3 id="about-thanks">{t.aboutThanksTitle}</h3>
    <p>{t.aboutThanks}</p>
  </section>

  <h3>{t.creditsTitle}</h3>
  <!-- creditsMpmb already says "not made or endorsed by MPMB"; the start page's own notice stays as it is. -->
  <p>{t.creditsMpmb}</p>
  <p>{t.creditsSrd}</p>

  <ul class="links">
    <li><a href={MPMB_DOWNLOAD} target="_blank" rel="noopener">{t.aboutGetPdf}</a></li>
    <li><a href={MPMB_PATREON} target="_blank" rel="noopener">{t.supportMpmb}</a></li>
    <li><a href={SOURCE_URL} target="_blank" rel="noopener">{t.source}</a></li>
    {#if BUILD.commit}
      <!-- Which version is online, linked to its exact source (GPL); also handy in bug reports. -->
      <li>
        <a href={sourceUrl(BUILD.commit)} target="_blank" rel="noopener"
          >{fill(t.version, { commit: BUILD.commit.slice(0, 7), date: builtOn })}</a
        >
      </li>
    {/if}
  </ul>
</Modal>

<style>
  p {
    margin: 0 0 0.5rem;
  }

  .lead {
    margin-bottom: 1rem;
  }

  h3 {
    margin: 1rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  /* The one warm part of the window: the thanks sit in a soft box of their own. */
  .thanks {
    padding: 0.25rem 1rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    border-radius: 0.75rem;
    background: var(--accent-soft);
  }

  .thanks h3 {
    margin-top: 0.5rem;
    color: var(--accent);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1.5rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
  }
</style>
