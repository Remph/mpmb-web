<script lang="ts">
  import { fill, pickLanguage, ui, type Lang } from './i18n';
  import { MPMB_PATREON } from './mpmb-links.ts';
  import PopUpLayer from './popups/PopUpLayer.svelte';
  import { Session } from './session.svelte.ts';
  import CharacterList from './views/CharacterList.svelte';
  import CharacterView from './views/CharacterView.svelte';
  import BuildView from './views/build/BuildView.svelte';
  import { BUILD, SOURCE_URL, sourceUrl } from './version.ts';

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
  const builtOn = $derived(
    BUILD.date &&
      new Date(`${BUILD.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }),
  );

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

  // The address says what is on screen, so a reload opens the same screen: "#/character/<id>", its
  // Build screen "…/build", or the Build screen's Choices step at one feature's choice,
  // "…/build/choices/<feature name>" (from the play view's features). "#/" and "" are the list.
  // Try it: https://regex101.com/?regex=%5E%23%5C%2Fcharacter%5C%2F%28%5B%5E%2F%5D%2B%29%28%5C%2Fbuild%28%3F%3A%5C%2Fchoices%5C%2F%28%5B%5E%2F%5D%2A%29%29%3F%29%3F%24&testString=%23%2Fcharacter%2Fabc%2Fbuild%2Fchoices%2FFighting%2520Style
  const CHARACTER_ROUTE = /^#\/character\/([^/]+)(\/build(?:\/choices\/([^/]*))?)?$/;
  let missing = $state(false);
  let building = $state(false);
  /** The feature whose choice the Build screen opens at, or null for its first step. */
  let choiceOf = $state<string | null>(null);

  async function route() {
    const match = CHARACTER_ROUTE.exec(location.hash);
    const id = match?.[1];
    building = Boolean(match?.[2]);
    choiceOf = match?.[3] === undefined ? null : decodeURIComponent(match[3]);
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
  {#if building}
    <BuildView {session} open={session.current} choice={choiceOf} {toggleLanguage} {t} />
  {:else}
    <CharacterView {session} open={session.current} {toggleLanguage} {t} />
  {/if}
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
    <!-- MPMB's condition for this site: say plainly, at the top, that it is not MPMB's. -->
    <p class="notice">{t.notAffiliated}</p>
    <CharacterList {session} {t} {lang} />

    <section class="about" aria-labelledby="credits-title">
      <p class="status">{t.lead} {t.status}</p>
      <h2 id="credits-title">{t.creditsTitle}</h2>
      <p>{t.creditsMpmb}</p>
      <p>{t.creditsSrd}</p>
      <p class="links">
        <a href={SOURCE_URL}>{t.source}</a>
        <a href={MPMB_PATREON}>{t.supportMpmb}</a>
        {#if BUILD.commit}
          <!-- Which version is online, linked to its exact source (GPL); also handy in bug reports. -->
          <a href={sourceUrl(BUILD.commit)}>{fill(t.version, { commit: BUILD.commit.slice(0, 7), date: builtOn })}</a>
        {/if}
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

  .notice {
    margin: 0 0 1.5rem;
    padding: 0.625rem 0.875rem;
    border-left: 3px solid var(--accent);
    border-radius: 0 0.5rem 0.5rem 0;
    background: var(--accent-soft);
    font-size: 0.9375rem;
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
