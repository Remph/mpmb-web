<!--
  The Build screen (M6, Remph picked its own screen, 2026-10-31): the steps on the left, each with what
  the character has, the chosen step on the right. Opened from the sheet menu (Build character, Level up)
  and for a new character. Every change goes through MPMB's own fields, as in the play view.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { setCount } from '../../build/modifiers.ts';
  import { ARMOUR_FIELD, weaponField, weaponRows } from '../../build/gear.ts';
  import { openSkillPicks, readLangTools, readSkillSources, skillChoices } from '../../build/proficiencies.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { counted, fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ABILITIES, shown, valueOf } from '../../play/read.ts';
  import { readSpells } from '../../play/spells.ts';
  import { unsentFor } from '../../build/spell-drafts.svelte.ts';
  import { readOnly } from '../../session.svelte.ts';
  import type { OpenCharacter, Session, Step } from '../../session.svelte.ts';
  import Modal from '../../popups/Modal.svelte';
  import Notes from '../Notes.svelte';
  import AddOnsWindow from '../play/AddOnsWindow.svelte';
  import SheetMenu from '../play/SheetMenu.svelte';
  import TopBar from '../TopBar.svelte';
  import AbilitiesStep from './AbilitiesStep.svelte';
  import BackgroundStep from './BackgroundStep.svelte';
  import ClassStep from './ClassStep.svelte';
  import FeatsStep from './FeatsStep.svelte';
  import GearStep from './GearStep.svelte';
  import ChoicesStep from './ChoicesStep.svelte';
  import ModifiersStep from './ModifiersStep.svelte';
  import SkillsStep from './SkillsStep.svelte';
  import SpeciesStep from './SpeciesStep.svelte';
  import SpellsStep from './SpellsStep.svelte';
  import { ownSpellsChanges, ownSpellsFile, parseOwnSpells } from '../../build/own-spells.ts';
  import LevelUp from './LevelUp.svelte';
  import ListsLine from './ListsLine.svelte';
  import { BUILD_STEPS } from './steps.ts';
  import type { BuildStep } from './steps.ts';

  interface Props {
    session: Session;
    open: OpenCharacter;
    /** A feature's name from the play view: the screen opens on the Choices step, at that feature's choice. */
    choice: string | null;
    /** Another step the address names: the Combat tab's "Change weapons" opens "Armour & weapons". */
    at: BuildStep | null;
    toggleLanguage: () => void;
    t: Texts;
  }

  let { session, open, choice, at, toggleLanguage, t }: Props = $props();

  // A restore point before the Build screen changes anything (Remph's pick, 2026-11-08); none when nothing
  // changed since the last one.
  onMount(() => void session.takePoint('build'));

  let step = $state<BuildStep>('class');
  $effect(() => {
    if (choice !== null) step = 'choices';
    else if (at !== null) step = at;
  });
  let menuOpen = $state(false);
  /**
   * Phones (M13, mock-up pass 1 and 2, Nick approved): below this width the ten steps fold into one picker
   * above the step, with the way on under the step. Matches the CSS's 699 px and the play view's PHONE_BELOW.
   * 0 before the first measurement: the laptop layout, as before.
   */
  const PHONE_BELOW = 700;
  let width = $state(0);
  const phone = $derived(width > 0 && width < PHONE_BELOW);
  let stepsOpen = $state(false);
  const index = $derived(BUILD_STEPS.indexOf(step));
  const prev = $derived(BUILD_STEPS[index - 1]);
  const next = $derived(BUILD_STEPS[index + 1]);
  /** A step picked on a phone starts at its top: the old step's scroll position would land mid-step. */
  function go(key: BuildStep) {
    step = key;
    stepsOpen = false;
    if (phone) window.scrollTo({ top: 0 });
  }
  let scriptsOpen = $state(false);
  let levelUpOpen = $state(false);
  let info = $state<BuilderInfo | null>(null);

  const fields = $derived(open.fields);
  const disabled = $derived(readOnly(open.status));
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

  /** Steps that offer MPMB's lists (classes, species, spells …), which sources and add-on scripts fill. */
  const LIST_STEPS: BuildStep[] = ['class', 'species', 'background', 'feats', 'gear', 'spells'];
  const scripts = $derived(open.meta.addOns.files.length + (open.meta.addOns.manual ? 1 : 0));

  const openChoices = $derived(info?.choices.filter((c) => c.open).length ?? 0);
  const modifiersSet = $derived(setCount(fields));
  const skillsOpen = $derived(openSkillPicks(skillChoices(fields, readSkillSources(fields))));
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
    skills: skillsOpen
      ? counted(t.buildSkillsOpenOne, t.buildSkillsOpen, skillsOpen)
      : readLangTools(fields, 'Language')
          .map((row) => row.name)
          .join(', ') || t.buildNone,
    feats: filled(Array.from({ length: 9 }, (_, i) => `Feat Name ${i + 1}`)).join(', ') || t.buildNone,
    gear: filled([ARMOUR_FIELD, ...weaponRows(fields).map(weaponField)]).join(' · ') || t.buildNone,
    choices: !info?.choices.length
      ? t.buildNone
      : openChoices
        ? fill(t.buildChoicesOpen, { n: String(openChoices) })
        : t.buildChoicesDone,
    // The sources on the spell sheet ("Wizard · Magic Initiate"); the step itself reads MPMB's dialogs.
    // A trailing " Spells" goes: https://regex101.com/?regex=%5Cs%2BSpells%24&testString=Wizard%20Spells
    spells:
      readSpells(fields)
        .map((source) => source.title.replace(/\s+Spells$/, ''))
        .join(' · ') || t.buildNone,
    modifiers: modifiersSet ? fill(t.buildModSetCount, { n: String(modifiersSet) }) : t.buildNone,
  });
  /** Shown as a badge on the step, like the mock-up: what still waits for the player. */
  /** Spells step picks not on the spell sheet yet: the player left the step before "Update spell sheet". */
  const unsent = $derived(unsentFor(open.meta.id, open.meta.updated)?.changes ?? 0);
  const badges = $derived<Partial<Record<BuildStep, number>>>({
    skills: skillsOpen,
    choices: openChoices,
    spells: unsent,
  });
  const stepTitles = $derived<Record<BuildStep, string>>({
    class: t.buildClassTitle,
    species: t.buildSpecies,
    background: t.buildBackground,
    abilities: t.buildAbilities,
    skills: t.buildSkillsStep,
    feats: t.buildFeats,
    gear: t.buildGearStep,
    choices: t.buildChoices,
    spells: t.buildSpellsStep,
    modifiers: t.buildModifiers,
  });
</script>

<svelte:window bind:innerWidth={width} />

<TopBar {open} back={{ href: playHref, label: t.buildBackToPlay }} {t} compact={phone}>
  {#if phone}
    <button type="button" class="menu-icon" aria-label={t.sheetMenu} onclick={() => (menuOpen = true)}>☰</button>
  {:else}
    <button type="button" onclick={() => (menuOpen = true)}>☰ {t.sheetMenu}</button>
  {/if}
</TopBar>

{#snippet stepList()}
  <ol>
    {#each BUILD_STEPS as key, i (key)}
      <li>
        <button
          type="button"
          class="step"
          class:on={step === key}
          aria-current={step === key ? 'step' : undefined}
          onclick={() => go(key)}
        >
          <span class="n">{i + 1}</span>
          <span class="t"><b>{stepTitles[key]}</b><small>{summaries[key]}</small></span>
          {#if badges[key]}<span class="badge" aria-hidden="true">{badges[key]}</span>{/if}
        </button>
      </li>
    {/each}
  </ol>
{/snippet}

{#if phone}
  <!--
    Phones: one line for the ten steps, sticky while the step scrolls by. The arrows go one step at a time; the
    middle opens the whole list as a sheet. A step with open picks gets its red count here too.
  -->
  <nav class="picker" aria-label={t.buildSteps}>
    <button
      type="button"
      class="arrow"
      disabled={!prev}
      aria-label={prev ? fill(t.buildStepPrev, { step: stepTitles[prev] }) : t.buildStepFirst}
      onclick={() => prev && go(prev)}><span aria-hidden="true">‹</span></button
    >
    <button type="button" class="current" aria-haspopup="dialog" onclick={() => (stepsOpen = true)}>
      <span class="lines">
        <b>{stepTitles[step]}</b>
        <small>
          {fill(t.buildStepOf, { n: String(index + 1), total: String(BUILD_STEPS.length) })}
          {#if badges[step]}
            ·
            <span class="open">{fill(t.buildStepOpen, { count: String(badges[step]) })}</span>
          {/if}
        </small>
      </span>
      <span class="caret" aria-hidden="true">▾</span>
    </button>
    <button
      type="button"
      class="arrow"
      disabled={!next}
      aria-label={next ? fill(t.buildStepNext, { step: stepTitles[next] }) : t.buildStepLast}
      onclick={() => next && go(next)}><span aria-hidden="true">›</span></button
    >
    <!-- Where you are among the ten; a step with open picks shows red. -->
    <ol class="progress" aria-hidden="true">
      {#each BUILD_STEPS as key (key)}
        <li class:on={step === key} class:open={!!badges[key]}></li>
      {/each}
    </ol>
  </nav>
{/if}

<div class="notes"><Notes notes={session.notes} /></div>

<div class="build" class:phone>
  {#if !phone}
    <nav class="rail" aria-label={t.buildSteps}>
      {@render stepList()}
      <a class="done" href={playHref}>{t.buildDone}</a>
    </nav>
  {/if}

  <div class="main">
    {#if !info && open.status === 'elsewhere'}
      <!-- Open in another tab: the line above offers to take it over. -->
    {:else if !info}
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
      <AbilitiesStep {info} {disabled} {change} setScores={(changes) => session.setScores(changes)} {t} />
    {:else if step === 'skills'}
      <SkillsStep {info} {fields} {disabled} {change} {t} />
    {:else if step === 'feats'}
      <FeatsStep {info} {fields} {disabled} {change} {t} />
    {:else if step === 'gear'}
      <GearStep {info} {fields} {disabled} {change} onsetup={(row, set) => void session.setAttackSetup(row, set)} {t} />
    {:else if step === 'choices'}
      <ChoicesStep {info} wanted={choice} {disabled} {pick} {t} />
    {:else if step === 'spells'}
      <SpellsStep
        load={() => session.spellsInfo()}
        apply={(picks, sheet) => session.setSpells(picks, sheet)}
        loadOwn={async () => parseOwnSpells(ownSpellsFile((await session.scriptFiles())?.files ?? [])?.text ?? '')}
        writeOwn={async (spells) =>
          session.setScripts(ownSpellsChanges(ownSpellsFile((await session.scriptFiles())?.files ?? []), spells), true)}
        {fields}
        characterId={open.meta.id}
        updated={open.meta.updated}
        {disabled}
        {t}
      />
    {:else}
      <ModifiersStep {fields} {disabled} {change} {t} />
    {/if}
    {#if info && LIST_STEPS.includes(step)}
      <ListsLine
        sources={info.sources}
        {scripts}
        disabled={disabled || open.status === 'working'}
        onscripts={() => (scriptsOpen = true)}
        onsources={() => void session.runMenu(['Functions', 'Source Material'])}
        {t}
      />
    {/if}
    {#if phone}
      <!-- The way on, at the end of the step: not sticky, so it never sits on top of the Spells step's own bar. -->
      <div class="way">
        {#if next}
          <a class="quiet-link" href={playHref}>{t.buildToPlay}</a>
          <button type="button" class="next" onclick={() => next && go(next)}
            >{fill(t.buildNext, { step: stepTitles[next] })} ›</button
          >
        {:else}
          <a class="done" href={playHref}>{t.buildDone}</a>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if stepsOpen}
  <Modal title={t.buildSteps} onescape={() => (stepsOpen = false)} closeLabel={t.close}>
    <!-- No second "Steps" navigation: the window is titled so, and the picker is the page's one. -->
    <div class="sheet-steps">{@render stepList()}</div>
  </Modal>
{/if}

{#if levelUpOpen && info}
  <LevelUp {info} {fields} {change} onclose={() => (levelUpOpen = false)} {t} />
{/if}

{#if scriptsOpen}
  <AddOnsWindow {session} {open} onclose={() => (scriptsOpen = false)} {t} />
{/if}

{#if menuOpen}
  <SheetMenu {session} {open} onclose={() => (menuOpen = false)} {toggleLanguage} {t} />
{/if}

<style>
  .notes {
    max-width: var(--page-max);
    margin-inline: auto;
    padding: 0 1rem;
  }

  .build {
    max-width: var(--page-max);
    margin-inline: auto;
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

  /* The step you are on: the whole box in the accent, no stripe down one side. */
  .step.on {
    border-color: var(--accent);
    background: var(--accent-soft);
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
  /* Outlined, not filled: each step has its own main button ("Choose a class"), and only one may be filled. */
  .done {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    margin-top: 0.75rem;
    border: 1px solid var(--accent);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .done:hover {
    background: var(--accent-soft);
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

  /* Phones (M13): one column; the steps live in the picker above and its sheet. */
  .build.phone {
    grid-template-columns: minmax(0, 1fr);
    padding: 0.75rem 0.75rem 2rem;
  }

  /* Like the play view's ☰ on a phone: the bar's one button, quiet. */
  .menu-icon {
    width: 44px;
    padding: 0;
    border-color: transparent;
    background: none;
    color: var(--accent);
    font-size: 1.375rem;
  }

  /*
   * The step picker (mock-up pass 1, Build): it floats over the step while it scrolls by, so it gets its own
   * surface. The top bar above it scrolls away, as in the play view.
   */
  .picker {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem max(0.25rem, env(safe-area-inset-right)) 0 max(0.25rem, env(safe-area-inset-left));
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .arrow {
    padding: 0;
    border-color: transparent;
    background: none;
    color: var(--accent);
    font-size: 1.75rem;
    line-height: 1;
  }

  .arrow:disabled {
    color: var(--line);
  }

  /*
   * What you came for: the step's name, on a line of its own so German's long names ("Fertigkeiten & Sprachen")
   * fit at 360 px; under it "5 of 10" and what still waits, in the badges' red. ▾ says the list opens.
   */
  .current {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    min-height: 48px;
    padding: 0.25rem 0.75rem;
    border-radius: 0.75rem;
    background: var(--paper);
    text-align: left;
  }

  .lines {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.2;
  }

  /* One line from 360 px; at 320 German "Fertigkeiten & Sprachen" takes two rather than being cut. */
  .lines b {
    font-size: 1rem;
    font-weight: 800;
    overflow-wrap: anywhere;
  }

  .lines small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .lines .open {
    color: var(--danger);
    font-weight: 700;
  }

  .caret {
    flex: none;
    color: var(--ink-muted);
  }

  /* Ten short segments under the picker: the lit one is the step you are on, red ones still wait for picks. */
  .progress {
    display: flex;
    grid-column: 1 / -1;
    gap: 0.25rem;
    margin: 0.375rem 0.5rem 0.375rem;
  }

  .progress li {
    flex: 1;
    height: 0.25rem;
    border-radius: 0.125rem;
    background: var(--line);
  }

  .progress li.open {
    background: var(--danger);
  }

  .progress li.on {
    height: 0.375rem;
    margin-top: -0.0625rem;
    background: var(--accent);
  }

  /* The steps as a sheet: the same rows as the laptop's list, tapped to go there. */
  .sheet-steps ol {
    gap: 0.25rem;
  }

  /* The way on: back to playing on the left, the next step on the right, both a full thumb wide. */
  .way {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .way > * {
    flex: 1 1 8rem;
    min-width: auto;
  }

  .way .done {
    margin-top: 0;
  }

  .quiet-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 0.75rem;
    color: var(--accent);
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }

  /* Outlined like the laptop's Done: the step's own main button (Choose, Update spell sheet) stays the filled one. */
  .next {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }
</style>
