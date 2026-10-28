<script lang="ts">
  import { pickLanguage, ui, type Lang } from './i18n';

  const storageKey = 'mpmb-web.lang';

  // Storage can be blocked (private mode, strict settings); the page must still work without it.
  function readStored(): string | null {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }

  let lang: Lang = $state(pickLanguage(navigator.languages, readStored()));
  const t = $derived(ui[lang]);

  $effect(() => {
    document.documentElement.lang = lang;
    document.title = t.title;
  });

  function toggleLanguage() {
    lang = lang === 'de' ? 'en' : 'de';
    try {
      localStorage.setItem(storageKey, lang);
    } catch {
      // Not remembered, but the switch still works for this visit.
    }
  }
</script>

<header>
  <span class="brand">{t.title}</span>
  <button type="button" onclick={toggleLanguage} aria-label={t.switchLanguageLabel} lang={lang === 'de' ? 'en' : 'de'}>
    {t.switchLanguage}
  </button>
</header>

<main>
  <h1>{t.title}</h1>
  <p class="lead">{t.lead}</p>
  <p class="status">{t.status}</p>

  <section aria-labelledby="credits-title">
    <h2 id="credits-title">{t.creditsTitle}</h2>
    <p>{t.creditsMpmb}</p>
    <p>{t.creditsSrd}</p>
    <p><a href="https://github.com/Remph/mpmb-web">{t.source}</a></p>
  </section>
</main>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem clamp(1rem, 4vw, 2rem);
    border-bottom: 1px solid var(--line);
  }

  .brand {
    font-weight: 600;
  }

  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0 1rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: clamp(1.5rem, 6vw, 4rem) clamp(1rem, 4vw, 2rem);
  }

  h1 {
    margin: 0 0 0.75rem;
    font-size: clamp(2rem, 5vw, 2.75rem);
    line-height: 1.1;
  }

  .lead {
    font-size: 1.25rem;
    margin: 0 0 0.5rem;
  }

  .status {
    color: var(--ink-muted);
    margin: 0 0 3rem;
  }

  h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-muted);
    margin: 0 0 0.75rem;
  }

  section p {
    margin: 0 0 0.75rem;
  }

  a {
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }
</style>
