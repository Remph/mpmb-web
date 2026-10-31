<!--
  The Build screen (M6, Nick picked its own screen, 2026-10-31): seven steps on the left, each with what
  the character has, the chosen step on the right. Opened from the sheet menu (Build character, Level up)
  and for a new character. Every change goes through MPMB's own fields, as in the play view.
-->
<script lang="ts">
  import { setCount } from '../../build/modifiers.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES, shown, valueOf } from '../../play/read.ts';
  import type { OpenCharacter, Session, Step } from '../../session.svelte.ts';
  import Notes from '../Notes.svelte';
  import SheetMenu from '../play/SheetMenu.svelte';
  import TopBar from '../TopBar.svelte';
  import AbilitiesStep from './AbilitiesStep.svelte';
  import BackgroundStep from './BackgroundStep.svelte';
  import ClassStep from './ClassStep.svelte';
  import FeatsStep from './FeatsStep.svelte';
  import ChoicesStep from './ChoicesStep.svelte';
  import ModifiersStep from './ModifiersStep.svelte';
  import SpeciesStep from './SpeciesStep.svelte';
  import LevelUp from './LevelUp.svelte';
  import { BUILD_STEPS } from './steps.ts';
  import type { BuildStep } from './steps.ts';

  interface Props {
    session: Session;
    open: OpenCharacter;
    toggleLanguage: () => void;
    t: Texts;
  }

  let { session, open, toggleLanguage, t }: Props = $props();

  let step = $state<BuildStep>('class');
  let menuOpen = $state(false);
  let levelUpOpen = $state(false);
  let info = $state<BuilderInfo | null>(null);

  const fields = $derived(open.fields);
  const disabled = $derived(open.status === 'opening' || open.status === 'error');
  const playHref = $derived(`#/character/${encodeURIComponent(open.meta.id)}`);
  const change = (steps: Step[]) => void session.change(steps);

  /**
   * A pick on the Choices step, with MPMB's choices read again right after: the step shows the new
   * state even where the pick changed nothing to save (MPMB no longer offered it).
   */
  async function pick(field: string, answer: string) {
    await session.pick(field, answer);
    const fresh = await session.builderInfo();
    if (fresh) info = fresh;
  }

  /**
   * MPMB's class data again after every saved change (a new level brings new features), and once the
   * sheet is open. `updated` changes with each save.
   */
  $effect(() => {
    void open.meta.updated;
    if (open.status === 'opening') return;
    void session.builderInfo().then((fresh) => {
      if (fresh) info = fresh;
    });
  });

  // The sheet menu's "Level up" opens the Build screen with the level-up question.
  $effect(() => {
    if (info && session.levelUpNext) {
      session.levelUpNext = false;
      step = 'class';
      levelUpOpen = true;
    }
  });

  const openChoices = $derived(info?.choices.filter((c) => c.open).length ?? 0);
  const modifiersSet = $derived(setCount(fields));
  const filled = (names: string[]) => names.map((n) => valueOf(fields, n)).filter(Boolean);
  const summaries = $derived<Record<BuildStep, string>>({
    class: info?.known.length
      ? info.known
          .map((k) => `${info?.classes.filter((c) => c.key === k.key)[0]?.name ?? k.key} ${k.level}`)
          .join(' · ')
      : t.buildNotChosen,
    species: valueOf(fields, 'Race') || t.buildNotChosen,
    background: valueOf(fields, 'Background') || t.buildNotChosen,
    abilities: ABILITIES.some((a) => shown(fields, a))
      ? ABILITIES.map((a) => shown(fields, a) || '–').join(' · ')
      : t.buildNotChosen,
    feats: filled(Array.from({ length: 9 }, (_, i) => `Feat Name ${i + 1}`)).join(', ') || t.buildNone,
    choices: !info?.choices.length
      ? t.buildNone
      : openChoices
        ? fill(t.buildChoicesOpen, { n: String(openChoices) })
        : t.buildChoicesDone,
    modifiers: modifiersSet ? fill(t.buildModSetCount, { n: String(modifiersSet) }) : t.buildNone,
  });
  /** Shown as a badge on the step, like the mock-up: what still waits for the player. */
  const badges = $derived<Partial<Record<BuildStep, number>>>({ choices: openChoices });
  const stepTitles = $derived<Record<BuildStep, string>>({
    class: t.buildClassTitle,
    species: t.buildSpecies,
    background: t.buildBackground,
    abilities: t.buildAbilities,
    feats: t.buildFeats,
    choices: t.buildChoices,
    modifiers: t.buildModifiers,
  });
</script>

<TopBar {open} back={{ href: playHref, label: t.buildBackToPlay }} {t}>
  <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
</TopBar>

<div class="notes"><Notes notes={session.notes} /></div>

<div class="build">
  <nav class="rail" aria-label={t.buildSteps}>
    <ol>
      {#each BUILD_STEPS as key, i (key)}
        <li>
          <button
            type="button"
            class="step"
            class:on={step === key}
            aria-current={step === key ? 'step' : undefined}
            onclick={() => (step = key)}
          >
            <span class="n">{i + 1}</span>
            <span class="t"><b>{stepTitles[key]}</b><small>{summaries[key]}</small></span>
            {#if badges[key]}<span class="badge" aria-hidden="true">{badges[key]}</span>{/if}
          </button>
        </li>
      {/each}
    </ol>
    <a class="done" href={playHref}>{t.buildDone}</a>
  </nav>

  <div class="main">
    {#if !info}
      <p class="loading">{t.opening}</p>
    {:else if step === 'class'}
      <ClassStep
        {info}
        {fields}
        {disabled}
        {change}
        onlevelup={() => (levelUpOpen = true)}
        confirmRemove={(name, first) => session.confirmRemoveClass(name, first)}
        {t}
      />
    {:else if step === 'species'}
      <SpeciesStep {info} {disabled} {change} {t} />
    {:else if step === 'background'}
      <BackgroundStep {info} {disabled} {change} {t} />
    {:else if step === 'abilities'}
      <AbilitiesStep {info} {disabled} {change} setScores={(changes) => void session.setScores(changes)} {t} />
    {:else if step === 'feats'}
      <FeatsStep {info} {fields} {disabled} {change} {t} />
    {:else if step === 'choices'}
      <ChoicesStep {info} {disabled} {pick} {t} />
    {:else}
      <ModifiersStep {fields} {disabled} {change} {t} />
    {/if}
  </div>
</div>

{#if levelUpOpen && info}
  <LevelUp {info} {fields} {change} onclose={() => (levelUpOpen = false)} {t} />
{/if}

{#if menuOpen}
  <SheetMenu {session} {open} onclose={() => (menuOpen = false)} {toggleLanguage} {t} />
{/if}

<style>
  .notes {
    padding: 0 1rem;
  }

  .build {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    padding: 0.75rem 1rem 2rem;
  }

  .rail {
    position: sticky;
    top: 0.75rem;
  }

  ol {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 56px;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    text-align: left;
  }

  .step.on {
    border-color: var(--accent);
    box-shadow: inset 4px 0 0 var(--accent);
  }

  .n {
    display: grid;
    flex: none;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .badge {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.375rem;
    border-radius: 0.75rem;
    background: var(--danger);
    color: var(--surface);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  .step.on .n {
    background: var(--accent);
    color: var(--on-accent);
  }

  .t {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .t small {
    overflow: hidden;
    color: var(--ink-muted);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "Done" is the screen's main way out: a link that looks like the primary button. */
  .done {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 600;
    text-decoration: none;
  }

  .main {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .loading {
    color: var(--ink-muted);
  }

  @media (max-width: 1099px) {
    .build {
      grid-template-columns: 220px minmax(0, 1fr);
    }

    .t small {
      white-space: normal;
    }
  }

  /* Phones come later (roadmap); until then the steps stack above the step. */
  @media (max-width: 699px) {
    .build {
      grid-template-columns: minmax(0, 1fr);
    }

    .rail {
      position: static;
    }
  }
</style>
