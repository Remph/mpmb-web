<!--
  MPMB's feature text with its marks (**bold**, #bold#, *italic*), one paragraph per line. Like the 2024
  sheet, a feature's name stands out in the accent colour, its source is quieter and its uses sit in an
  outlined pill; a line that is all bold (a class, a species) is a heading. MPMB's note to use the PDF's
  "Choose Feature" button becomes a link to the Build screen's Choices step, where the app has it. Empty
  lines are dropped, except in notes (`gaps`), where a player's empty line becomes a gap.
-->
<script lang="ts">
  import { pointsToChooseFeature, splitAtChooseButton } from '../../build/choose-link.ts';
  import { featureLine, spacedLines } from '../../play/read.ts';

  interface Props {
    text: string;
    /** Where a feature's choice is made (by the feature's name), and the link's text; null: no links. */
    choose?: { href: (feature: string) => string; label: string } | null;
    /** Show an empty line (or several) as a gap: for notes the player wrote. */
    gaps?: boolean;
  }

  let { text, choose = null, gaps = false }: Props = $props();
  const spaced = $derived(spacedLines(text));
  const lines = $derived(spaced.map(({ line }) => featureLine(line)));
  /** The lines that get a gap above them; none outside notes. */
  const gapAbove = $derived(spaced.map(({ gap }) => gaps && gap));
  /**
   * The feature each line belongs to: its own name, or the last name above it, so a link in a description's
   * second line still leads to that feature's choice.
   */
  const features = $derived(
    lines.reduce<string[]>((names, line) => {
      const own = 'runs' in line ? line.runs.filter((run) => run.role === 'name')[0]?.text : undefined;
      return [...names, own ?? ('heading' in line ? '' : (names.at(-1) ?? ''))];
    }, []),
  );
</script>

{#each lines as line, i (i)}
  {#if 'heading' in line}
    <h3 class:gap={gapAbove[i]}>{line.heading}</h3>
  {:else}
    {@const feature = features[i] ?? ''}
    <p class:gap={gapAbove[i]}>
      {#each line.runs as run, j (j)}
        {#if run.role === 'usage' && choose && pointsToChooseFeature(run.text)}<a
            class="usage choose"
            href={choose.href(feature)}>{choose.label}</a
          >{:else if run.role === 'name'}<b class="name">{run.text}</b>{:else if run.role === 'usage'}<span
            class="usage">{run.text}</span
          >{:else if run.role === 'source'}<span class="source">{run.text}</span>{:else if run.bold}<b>{run.text}</b
          >{:else if run.italic}<i>{run.text}</i
          >{:else if choose}{#each splitAtChooseButton(run.text) as part, k (k)}{#if k % 2}<a
                class="inline"
                href={choose.href(feature)}>{choose.label}</a
              >{:else}{part}{/if}{/each}{:else}{run.text}{/if}
      {/each}
    </p>
  {/if}
{/each}

<style>
  p {
    margin: 0 0 0.375rem;
    max-width: 70ch;
  }

  h3 {
    margin: 0.75rem 0 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 2px solid var(--accent);
    font-size: 1.0625rem;
    font-weight: 800;
  }

  h3:first-child {
    margin-top: 0;
  }

  /* About one empty line of the text's own size, where the player left one (margins collapse with the
     line above's, so this is the whole gap). */
  .gap {
    margin-top: 1.25em;
  }

  .name {
    color: var(--accent);
    font-weight: 800;
  }

  .source {
    margin-left: 0.25rem;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .usage {
    display: inline-block;
    margin-left: 0.25rem;
    padding: 0 0.5rem;
    border: 1px solid var(--accent);
    border-radius: 1rem;
    color: var(--accent);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  /* A link that looks like the pills next to it; the tap area reaches above and below the line to 44 px. */
  .choose {
    position: relative;
    background: var(--accent-soft);
    text-decoration: none;
  }

  .choose::after {
    content: '';
    position: absolute;
    inset: -0.75rem -0.25rem;
  }

  /* MPMB's mention of the PDF's "Choose Feature" button, as a link in the running text. */
  .inline {
    color: var(--accent);
    font-weight: 700;
  }

  .choose:hover,
  .choose:focus-visible {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
