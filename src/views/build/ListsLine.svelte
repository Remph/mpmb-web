<!--
  Under a Build step's lists (M9, as in Remph's pick, 2026-11-03): where what they offer comes from, the
  sources switched on and the add-on scripts, with a way to change either. "Sources" is MPMB's own Source
  Selection; "Add-on scripts" the app's window.
-->
<script lang="ts">
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';

  interface Props {
    /** The sources switched on, by name (BuilderInfo.sources). */
    sources: string[];
    /** How many add-on scripts the sheet carries (files and the pasted code). */
    scripts: number;
    disabled: boolean;
    onscripts: () => void;
    onsources: () => void;
    t: Texts;
  }

  let { sources, scripts, disabled, onscripts, onsources, t }: Props = $props();

  const names = $derived(sources.join(', ') || t.listsNoSources);
  const line = $derived(
    scripts
      ? fill(t.listsShowScripts, { sources: names, scripts: counted(t.addOnCountOne, t.addOnCount, scripts) })
      : fill(t.listsShow, { sources: names }),
  );
</script>

<div class="lists">
  <p>{line}</p>
  <!-- The two buttons wrap together, so neither ends up alone on a line. -->
  <span class="acts">
    <button type="button" class="quiet" {disabled} onclick={onscripts}>{t.addOnsTitle}</button>
    <button type="button" class="quiet" {disabled} onclick={onsources}>{t.menuSources}</button>
  </span>
</div>

<style>
  .lists {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    padding: 0.375rem 0.5rem 0.375rem 1rem;
    border: 1px dashed var(--line);
    border-radius: 0.75rem;
  }

  p {
    flex: 1 1 18rem;
    margin: 0;
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .acts {
    display: flex;
    margin-left: auto;
  }

  button.quiet {
    color: var(--accent);
    font-weight: 600;
  }
</style>
