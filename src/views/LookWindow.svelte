<!--
  The Look window: the theme, light or dark, and whether characters show their sheet colour. Like the
  language, it counts for this browser and acts at once, nothing to save. Opened from the start page and the
  sheet menu.
-->
<script lang="ts">
  import { fill, type Texts } from '../i18n.ts';
  import { hasOneMode, MODES, sheetColor, THEMES, type Mode, type Theme } from '../look.ts';
  import { look } from '../look.svelte.ts';
  import Modal from '../popups/Modal.svelte';
  import type { Session } from '../session.svelte.ts';

  interface Props {
    onclose: () => void;
    /** For the open character's sheet colour, when one is open. */
    session?: Session;
    t: Texts;
  }

  let { onclose, session, t }: Props = $props();

  const themeText = (theme: Theme): { title: string; line: string } =>
    ({
      purple: { title: t.lookPurple, line: t.lookPurpleLine },
      campfire: { title: t.lookCampfire, line: t.lookCampfireLine },
      oled: { title: t.lookOled, line: t.lookOledLine },
    })[theme];

  const modeText = (mode: Mode): string => ({ device: t.lookDevice, light: t.lookLight, dark: t.lookDark })[mode];

  const oneMode = $derived(hasOneMode(look.current.theme));
  const sheetOn = $derived(look.current.sheetColors);

  /** The open character's colour as its sheet names it ("purple" when the field is empty: MPMB's default). */
  const rawColor = $derived.by(() => {
    const value = session?.current?.fields['Color.Theme']?.value;
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
  });
  const colorName = $derived.by(() => {
    if (!rawColor) return null;
    const names: Record<string, string> = {
      aqua: t.sheetColorAqua,
      blue: t.sheetColorBlue,
      brown: t.sheetColorBrown,
      gray: t.sheetColorGray,
      green: t.sheetColorGreen,
      orange: t.sheetColorOrange,
      pink: t.sheetColorPink,
      purple: t.sheetColorPurple,
      red: t.sheetColorRed,
      teal: t.sheetColorTeal,
      yellow: t.sheetColorYellow,
    };
    return names[rawColor] ?? rawColor;
  });
  const swatch = $derived(sheetColor(rawColor));
</script>

<Modal title={t.lookTitle} onescape={onclose} closeLabel={t.close} wide>
  <h3 id="look-themes">{t.lookThemes}</h3>
  <div class="themes" role="group" aria-labelledby="look-themes">
    {#each THEMES as theme (theme)}
      <button
        type="button"
        class="theme"
        aria-pressed={look.current.theme === theme}
        onclick={() => look.set({ theme })}
      >
        <!-- A small picture of the theme, light and dark side by side; colours fixed, they show the other themes. -->
        <span class={`preview ${theme}`} aria-hidden="true">
          {#if !hasOneMode(theme)}<span class="half light"><i></i><b></b></span>{/if}
          <span class="half dark"><i></i><b></b></span>
        </span>
        <span class="text"><b>{themeText(theme).title}</b><small>{themeText(theme).line}</small></span>
      </button>
    {/each}
  </div>

  <div class="settings">
    <div class="setting">
      <span id="look-mode">{t.lookMode}<small>{oneMode ? t.lookOneMode : t.lookModeLine}</small></span>
      <span class="seg" role="group" aria-labelledby="look-mode">
        {#each MODES as mode (mode)}
          <button
            type="button"
            aria-pressed={oneMode ? mode === 'dark' : look.current.mode === mode}
            disabled={oneMode}
            onclick={() => look.set({ mode })}>{modeText(mode)}</button
          >
        {/each}
      </span>
    </div>
    <div class="setting">
      <span id="look-sheet"
        >{t.lookSheet}<small>{t.lookSheetLine}</small>
        {#if colorName}
          <small class="now"
            ><span class={`dot ${swatch ?? 'theme'}`} aria-hidden="true"></span>{fill(t.lookSheetNow, {
              color: colorName,
            })}</small
          >
        {/if}
      </span>
      <!-- A switch, not a check box: it acts at once. The words say the state too. -->
      <button
        type="button"
        role="switch"
        class="switch"
        aria-checked={sheetOn}
        aria-labelledby="look-sheet"
        onclick={() => look.set({ sheetColors: !sheetOn })}
        ><span class="track"><span class="knob"></span></span>{sheetOn ? t.switchOn : t.switchOff}</button
      >
    </div>
  </div>

  {#snippet actions()}
    <button type="button" class="primary" onclick={onclose}>{t.done}</button>
  {/snippet}
</Modal>

<style>
  h3 {
    margin: 1rem 0 0.375rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  h3:first-child {
    margin-top: 0.25rem;
  }

  .themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr));
    gap: 0.5rem;
  }

  .theme {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: 72px;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    text-align: left;
  }

  /* The chosen one: in the accent, with a heavier border, so it doesn't rely on colour alone. */
  .theme[aria-pressed='true'] {
    border: 2px solid var(--accent);
    background: var(--accent-soft);
  }

  .theme[aria-pressed='true'] b {
    color: var(--accent);
  }

  .text {
    display: grid;
    gap: 0.125rem;
  }

  small {
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  /* The preview: per half a bar on top (i) and an accent button (b) on the page. */
  .preview {
    display: flex;
    overflow: hidden;
    width: 4rem;
    height: 3rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .half {
    position: relative;
    flex: 1;
    background: var(--p);
  }

  .half i {
    position: absolute;
    inset: 0 0 auto;
    height: 0.75rem;
    background: var(--bar-p);
  }

  .half b {
    position: absolute;
    right: 0.25rem;
    bottom: 0.3rem;
    left: 0.25rem;
    height: 0.6rem;
    border-radius: 0.3rem;
    background: var(--a);
  }

  .purple .light {
    --p: #f3f2f7;
    --bar-p: #ffffff;
    --a: #4b3fa0;
  }

  .purple .dark {
    --p: #15141a;
    --bar-p: #1f1d26;
    --a: #a99ff2;
  }

  .campfire .light {
    --p: #f7f0f5;
    --bar-p: linear-gradient(100deg, #48309a, #a8609e);
    --a: #5b3fa6;
  }

  .campfire .dark {
    --p: #0e0920;
    --bar-p: linear-gradient(100deg, #0b0720, #1f1444);
    --a: #ffb454;
  }

  .oled .dark {
    --p: #000000;
    --bar-p: #000000;
    --a: #b1a8f5;
  }

  .oled .dark i {
    border-bottom: 1px solid #2f2c38;
  }

  .settings {
    margin-top: 1rem;
    padding: 0.25rem 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  .setting {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 52px;
    padding: 0.5rem 0;
  }

  .setting + .setting {
    border-top: 1px solid var(--line);
  }

  .setting small {
    display: block;
  }

  .setting .now {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .dot {
    flex: none;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: var(--sheet-c, var(--accent));
  }

  .dot.aqua {
    --sheet-c: var(--sheet-aqua);
  }
  .dot.blue {
    --sheet-c: var(--sheet-blue);
  }
  .dot.brown {
    --sheet-c: var(--sheet-brown);
  }
  .dot.gray {
    --sheet-c: var(--sheet-gray);
  }
  .dot.green {
    --sheet-c: var(--sheet-green);
  }
  .dot.orange {
    --sheet-c: var(--sheet-orange);
  }
  .dot.pink {
    --sheet-c: var(--sheet-pink);
  }
  .dot.red {
    --sheet-c: var(--sheet-red);
  }
  .dot.teal {
    --sheet-c: var(--sheet-teal);
  }
  .dot.yellow {
    --sheet-c: var(--sheet-yellow);
  }

  /* Three even buttons; on a narrow window a long name wraps inside its button, not to a new row. */
  .seg {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, auto));
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    padding: 0 0.75rem;
    border: 0;
    border-radius: 0;
    line-height: 1.2;
    color: var(--ink-muted);
    font-weight: 600;
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
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

  /* Narrow windows: the three light/dark buttons go under their name. */
  @media (max-width: 599px) {
    .setting {
      grid-template-columns: minmax(0, 1fr);
    }

    .seg {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track,
    .knob {
      transition: none;
    }
  }
</style>
