<script lang="ts">
  import { pickLanguage, ui, type Lang } from './i18n';
  import PopUpLayer from './popups/PopUpLayer.svelte';
  import { Session } from './session.svelte.ts';
  import CharacterList from './views/CharacterList.svelte';
  import CharacterView from './views/CharacterView.svelte';

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
  const session = new Session(() => t);

  $effect(() => {
    document.documentElement.lang = lang;
    document.title = session.current?.meta.name ? `${session.current.meta.name} · ${t.title}` : t.title;
  });

  function toggleLanguage() {
    lang = lang === 'de' ? 'en' : 'de';
    try {
      localStorage.setItem(storageKey, lang);
    } catch {
      // Not remembered, but the switch still works for this visit.
    }
  }

  // The address says what is on screen ("#/character/<id>"), so a reload opens the same character.
  // Matches "#/character/3f2a-…" and takes the id; "#/" and "" are the list.
  // Try it: https://regex101.com/?regex=%5E%23%5C%2Fcharacter%5C%2F(.%2B)%24&testString=%23%2Fcharacter%2Fabc
  const CHARACTER_ROUTE = /^#\/character\/(.+)$/;
  let missing = $state(false);

  async function route() {
    const id = CHARACTER_ROUTE.exec(location.hash)?.[1];
    if (!id) {
      if (session.current) await session.close();
      missing = false;
      return;
    }
    if (session.current?.meta.id === id) return;
    await session.close();
    missing = !(await session.open(decodeURIComponent(id)));
  }

  void session.start().then(route);
</script>

<svelte:window onhashchange={route} />

{#if session.current}
  <!-- The play view brings its own top bar and uses the whole width; the language sits in its menu. -->
  <CharacterView {session} open={session.current} {toggleLanguage} {t} />
{:else}
  <header>
    <a class="brand" href="#/">{t.title}</a>
    <button
      type="button"
      onclick={toggleLanguage}
      aria-label={t.switchLanguageLabel}
      lang={lang === 'de' ? 'en' : 'de'}
    >
      {t.switchLanguage}
    </button>
  </header>

  <main>
    {#if missing}
      <p class="missing">{t.notFound}</p>
    {/if}
    <CharacterList {session} {t} {lang} />

    <section class="about" aria-labelledby="credits-title">
      <p class="status">{t.lead} {t.status}</p>
      <h2 id="credits-title">{t.creditsTitle}</h2>
      <p>{t.creditsMpmb}</p>
      <p>{t.creditsSrd}</p>
      <p class="links">
        <a href="https://github.com/Remph/mpmb-web">{t.source}</a>
        <a href="https://www.patreon.com/morepurplemorebetter">{t.supportMpmb}</a>
      </p>
    </section>
  </main>
{/if}

<PopUpLayer popUps={session.popUps} {t} />

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
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-weight: 600;
    color: inherit;
    text-decoration: none;
  }

  main {
    max-width: 64rem;
    margin: 0 auto;
    padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2rem) 3rem;
  }

  .missing {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--danger);
    border-radius: 0.5rem;
  }

  .about {
    margin-top: 3rem;
    max-width: 42rem;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .about h2 {
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 1.5rem 0 0.5rem;
  }

  .about p {
    margin: 0 0 0.5rem;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1.5rem;
  }

  .links a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
  }
</style>
