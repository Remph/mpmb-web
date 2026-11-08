<script lang="ts">
  import { fill, pickLanguage, ui, type Lang } from './i18n';
  import { MPMB_PATREON } from './mpmb-links.ts';
  import PopUpLayer from './popups/PopUpLayer.svelte';
  import { Session } from './session.svelte.ts';
  import CharacterList from './views/CharacterList.svelte';
  import CharacterView from './views/CharacterView.svelte';
  import BuildView from './views/build/BuildView.svelte';
  import HomebrewWindow from './views/HomebrewWindow.svelte';
  import LookWindow from './views/LookWindow.svelte';
  import { look } from './look.svelte.ts';
  import { sheetColor } from './look.ts';
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

  /**
   * With "Sheet colours" on, the open character's colour from its MPMB sheet replaces the accent (app.css,
   * #app[data-sheet]); on #app so popups and windows take it too. The start page keeps the theme's own.
   */
  const accent = $derived(
    look.current.sheetColors && session.current ? sheetColor(session.current.fields['Color.Theme']?.value) : null,
  );
  $effect(() => {
    const app = document.getElementById('app');
    if (!app) return;
    if (accent) app.dataset['sheet'] = accent;
    else delete app.dataset['sheet'];
  });

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
  // Build screen "…/build", the Build screen's Choices step at one feature's choice,
  // "…/build/choices/<feature name>" (from the play view's features), its "Armour & weapons" step,
  // "…/build/gear" (from the Combat tab), or its "Spells" step, "…/build/spells" (from the Spells tab).
  // "#/" and "" are the list. "#/character/abc/build/spells" passes, "#/character/abc/build/notes" doesn't.
  // Try it: https://regex101.com/?regex=%5E%23%5C%2Fcharacter%5C%2F%28%5B%5E%2F%5D%2B%29%28%5C%2Fbuild%28%3F%3A%5C%2Fchoices%5C%2F%28%5B%5E%2F%5D%2A%29%7C%5C%2F%28gear%7Cspells%29%29%3F%29%3F%24&testString=%23%2Fcharacter%2Fabc%2Fbuild%2Fspells
  // A feature's choice: https://regex101.com/?regex=%5E%23%5C%2Fcharacter%5C%2F%28%5B%5E%2F%5D%2B%29%28%5C%2Fbuild%28%3F%3A%5C%2Fchoices%5C%2F%28%5B%5E%2F%5D%2A%29%7C%5C%2F%28gear%7Cspells%29%29%3F%29%3F%24&testString=%23%2Fcharacter%2Fabc%2Fbuild%2Fchoices%2FFighting%2520Style
  const CHARACTER_ROUTE = /^#\/character\/([^/]+)(\/build(?:\/choices\/([^/]*)|\/(gear|spells))?)?$/;
  let rules = $state(false);
  let looks = $state(false);
  let missing = $state(false);
  let building = $state(false);
  /** The feature whose choice the Build screen opens at, or null for its first step. */
  let choiceOf = $state<string | null>(null);
  /** A Build step the address names other than Choices ("gear", "spells"), or null. */
  let stepOf = $state<'gear' | 'spells' | null>(null);

  async function route() {
    const match = CHARACTER_ROUTE.exec(location.hash);
    const id = match?.[1];
    building = Boolean(match?.[2]);
    choiceOf = match?.[3] === undefined ? null : decodeURIComponent(match[3]);
    stepOf = match?.[4] === 'gear' || match?.[4] === 'spells' ? match[4] : null;
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

  /**
   * An error nothing else caught, shown as a note instead of only in the console (tech review finding 6).
   * Chrome reports a ResizeObserver that needed a second pass as an error; it is harmless, so it is left out.
   */
  function uncaught(err: unknown) {
    const text = err instanceof Error ? err.message : String(err ?? '');
    if (!text || text.includes('ResizeObserver loop')) return;
    session.reportError(err);
  }

  // Leaving the page or switching to another app (the iPad freezes the page then): save what isn't saved.
  function hidden() {
    if (document.visibilityState === 'hidden') session.flush();
  }
</script>

<svelte:window
  onhashchange={route}
  onpagehide={() => session.flush()}
  onerror={(event) => uncaught(event instanceof ErrorEvent ? (event.error ?? event.message) : null)}
  onunhandledrejection={(event) => uncaught(event.reason)}
/>
<svelte:document onvisibilitychange={hidden} />

{#if session.current}
  <!-- The play view brings its own top bar and uses the whole width; the language sits in its menu. -->
  {#if building}
    <BuildView {session} open={session.current} choice={choiceOf} at={stepOf} {toggleLanguage} {t} />
  {:else}
    <CharacterView {session} open={session.current} {toggleLanguage} {t} />
  {/if}
{:else}
  <header>
    <a class="brand" href="#/">{t.title}</a>
    <span class="end">
      <button type="button" onclick={() => (rules = true)}>{t.homebrewTitle}</button>
      <button type="button" onclick={() => (looks = true)}>{t.lookTitle}</button>
      <button
        type="button"
        onclick={toggleLanguage}
        aria-label={t.switchLanguageLabel}
        lang={lang === 'de' ? 'en' : 'de'}
      >
        {t.switchLanguage}
      </button>
    </span>
  </header>
  {#if rules}
    <HomebrewWindow onclose={() => (rules = false)} {t} />
  {/if}
  {#if looks}
    <LookWindow onclose={() => (looks = false)} {session} {t} />
  {/if}

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
    /* A theme may paint the bar (Campfire's sky); Purple leaves it on the page. */
    background: var(--bar, none);
    color: var(--on-bar, inherit);
  }

  .end {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-family: var(--font-display, var(--font));
    font-variation-settings: 'CASL' 0.6;
    font-weight: 600;
    white-space: nowrap;
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
