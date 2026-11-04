<!--
  Build step 5 "Skills & languages" (M6.5, as in the mock-ups Remph saw): MPMB's note on what the class,
  species and background give, the 18 skill boxes to tick, languages and tools, and the armour and weapon
  training. Every tap goes into MPMB's own fields: a skill box runs MPMB's applySkillClick, a training box
  its setCheckboxProfsManual, and a language or tool is typed into one of the sheet's eight rows.
-->
<script lang="ts">
  import {
    OTHER_ARMOUR,
    OTHER_WEAPONS,
    RARE_LANGUAGES,
    STANDARD_LANGUAGES,
    TRAINING,
    freeLangToolRow,
    readLangTools,
    readSkillSources,
    skillChoices,
    skillText,
  } from '../../build/proficiencies.ts';
  import type { LangTool, LangToolKind } from '../../build/proficiencies.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { SKILLS, isOn, valueOf } from '../../play/read.ts';
  import type { SkillKey } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import LangToolPick from './LangToolPick.svelte';

  interface Props {
    info: BuilderInfo;
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { info, fields, disabled, change, t }: Props = $props();

  /** A tap ticks proficiency or, switched over, expertise (MPMB's second box per skill). */
  let mode = $state<'Prof' | 'Exp'>('Prof');
  /** The language or tool pop-up: which kind, and the row it replaces (null adds to a free row). */
  let picking = $state<{ kind: LangToolKind; row: string | null } | null>(null);

  const sources = $derived(readSkillSources(fields));
  const choices = $derived(skillChoices(fields, sources));
  const languages = $derived(readLangTools(fields, 'Language'));
  const tools = $derived(readLangTools(fields, 'Tool'));

  /** The line under a skill's name: where it comes from, or which open choice may pick it. */
  function skillLine(key: SkillKey): string {
    const fixed = sources.filter((s) => s.choose === 0 && s.skills.includes(key))[0];
    if (isOn(fields, `${key} Prof`)) {
      if (fixed) return fixed.source;
      return choices.filter((c) => c.picked.includes(key))[0]?.source ?? t.skillsOwnPick;
    }
    const open = choices.filter((c) => c.chosen < c.choose && c.skills.includes(key))[0];
    return open ? fill(t.skillsCanPick, { source: open.source }) : '';
  }

  const canPick = (key: SkillKey): boolean =>
    !isOn(fields, `${key} Prof`) && choices.some((c) => c.chosen < c.choose && c.skills.includes(key));

  const sourceLine = (row: LangTool): string =>
    row.sources.length ? row.sources.join(', ') + (row.choice ? ` · ${t.skillsYourChoice}` : '') : t.skillsOwnPick;

  function take(name: string) {
    if (!picking) return;
    const row = picking.row ?? freeLangToolRow(fields, picking.kind);
    if (row) change([{ edit: row, text: name }]);
    picking = null;
  }

  /** Fills the choice slot being changed with a row the player added by hand, which then goes. */
  function move(from: LangTool) {
    if (!picking?.row) return;
    change([
      { edit: picking.row, text: from.name },
      { edit: from.field, text: '' },
    ]);
    picking = null;
  }

  function editOther(field: string, event: Event) {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    if (text !== valueOf(fields, field)) change([{ edit: field, text }]);
  }
</script>

<section class="card" aria-labelledby="skills-title">
  <header class="head">
    <div>
      <h2 id="skills-title">{t.buildSkillsTitle}</h2>
      <p class="line">{t.skillsLine}</p>
    </div>
    <div class="seg" role="group" aria-label={t.skillsMode}>
      <button type="button" aria-pressed={mode === 'Prof'} onclick={() => (mode = 'Prof')}>{t.skillsProficiency}</button
      >
      <button type="button" aria-pressed={mode === 'Exp'} onclick={() => (mode = 'Exp')}>{t.skillsExpertise}</button>
    </div>
  </header>
  {#if sources.length}
    <ul class="sources">
      {#each sources as source, i (i)}
        {@const choice = choices.filter((c) => c.source === source.source)[0]}
        {@const text = skillText(source, t)}
        <li>
          <b>{source.source}</b>
          <span class="text" lang={text.text === source.text ? 'en' : undefined}
            >{text.text}{#if text.rest}<small lang="en">{text.rest}</small>{/if}</span
          >
          {#if choice}
            <span class="count" class:done={choice.chosen >= choice.choose}
              >{fill(t.skillsChosen, { n: String(choice.chosen), of: String(choice.choose) })}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <div class="skills">
    {#each SKILLS as [key] (key)}
      {@const line = skillLine(key)}
      <button
        type="button"
        class="skill"
        class:on={isOn(fields, `${key} Prof`)}
        class:exp={isOn(fields, `${key} Exp`)}
        class:can={canPick(key)}
        aria-pressed={isOn(fields, `${key} ${mode}`)}
        {disabled}
        onclick={() => change([{ click: `${key} ${mode}` }])}
      >
        <span class="dot" aria-hidden="true"></span>
        <span class="name"
          ><b>{t[`skill${key}`]}</b>{#if line}<small>{line}</small>{/if}</span
        >
        {#if isOn(fields, `${key} Exp`)}<span class="sr">{t.skillsExpertise}</span>{/if}
      </button>
    {/each}
  </div>
</section>

<div class="pair">
  {#each [['Language', languages, t.languages, t.skillsAddLanguage], ['Tool', tools, t.tools, t.skillsAddTool]] as const as [kind, rows, title, add] (kind)}
    <section class="card" aria-label={title}>
      <h3>{title}</h3>
      <ul class="pills">
        {#each rows as row (row.field)}
          <li class="pill" class:own={!row.sources.length}>
            <span><b>{row.name}</b> <small>{sourceLine(row)}</small></span>
            {#if row.choice}
              <button
                type="button"
                class="quiet icon"
                aria-label={fill(t.skillsChange, { name: row.name })}
                {disabled}
                onclick={() => (picking = { kind, row: row.field })}>✎</button
              >
            {/if}
            <!-- A choice slot may go too: a species changed late may offer a choice the player already
                 made by hand (a language "added by you" before). -->
            {#if row.choice || !row.sources.length}
              <button
                type="button"
                class="quiet icon"
                aria-label={fill(t.skillsRemove, { name: row.name })}
                {disabled}
                onclick={() => change([{ edit: row.field, text: '' }])}>✕</button
              >
            {/if}
          </li>
        {/each}
        <li>
          <button
            type="button"
            class="add"
            disabled={disabled || freeLangToolRow(fields, kind) === null}
            onclick={() => (picking = { kind, row: null })}>+ {add}</button
          >
        </li>
      </ul>
      {#if kind === 'Tool' && valueOf(fields, 'Too Text')}
        <p class="note">{fill(t.skillsToolCheck, { tool: valueOf(fields, 'Too Text') })}</p>
      {/if}
    </section>
  {/each}
</div>

<section class="card" aria-labelledby="training-title">
  <h3 id="training-title">{t.skillsTraining}</h3>
  <p class="line">{t.skillsTrainingLine}</p>
  {#each [['armour', TRAINING.armour, t.profArmour, OTHER_ARMOUR, t.skillsOtherArmour], ['weapons', TRAINING.weapons, t.profWeapons, OTHER_WEAPONS, t.skillsOtherWeapons]] as const as [group, boxes, label, other, hint] (group)}
    <div class="training">
      <span class="label">{label}</span>
      <div class="chips">
        {#each boxes as [field, key] (field)}
          <button
            type="button"
            class="chip"
            aria-pressed={isOn(fields, field)}
            {disabled}
            onclick={() => change([{ click: field }])}>{t[`prof_${key}`]}</button
          >
        {/each}
        <input
          class="other"
          type="text"
          value={valueOf(fields, other)}
          placeholder={hint}
          aria-label={fill(t.skillsOtherLabel, { group: label })}
          {disabled}
          onchange={(e) => editOther(other, e)}
        />
      </div>
    </div>
  {/each}
</section>

{#if picking}
  <LangToolPick
    kind={picking.kind}
    groups={picking.kind === 'Language'
      ? [
          { title: t.skillsStandard, names: STANDARD_LANGUAGES },
          { title: t.skillsRare, names: RARE_LANGUAGES },
        ]
      : [{ title: t.tools, names: info.tools }]}
    known={(picking.kind === 'Language' ? languages : tools).map((r) => r.name)}
    own={picking.row ? (picking.kind === 'Language' ? languages : tools).filter((r) => !r.sources.length) : []}
    ontake={take}
    onmove={move}
    onclose={() => (picking = null)}
    {t}
  />
{/if}

<style>
  .card {
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 700;
  }

  .line {
    margin: 0.125rem 0 0.5rem;
    color: var(--ink-muted);
  }

  .seg {
    display: inline-flex;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
  }

  .seg button {
    border: 0;
    border-radius: 0;
    color: var(--ink-muted);
  }

  .seg button + button {
    border-left: 1px solid var(--line);
  }

  .seg button[aria-pressed='true'] {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .sources {
    display: grid;
    gap: 0.125rem;
    margin: 0 0 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    list-style: none;
  }

  .sources li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 0.5rem;
  }

  .sources .text {
    flex: 1;
    min-width: 12rem;
  }

  /* MPMB's own words, when they say more than the skills (a German line is built from the app's names). */
  .sources .text small {
    display: block;
    color: var(--ink-muted);
  }

  .count {
    color: var(--danger);
    font-weight: 700;
    white-space: nowrap;
  }

  .count.done {
    color: var(--ok);
  }

  .skills {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.375rem;
  }

  .skill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 52px;
    padding: 0.25rem 0.625rem;
    border-radius: 0.625rem;
    text-align: left;
  }

  .skill.can {
    border-style: dashed;
    border-color: var(--accent);
  }

  .dot {
    flex: none;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--ink-muted);
    border-radius: 50%;
  }

  .skill.on .dot {
    border-color: var(--accent);
    background: var(--accent);
  }

  /* Expertise: a ring around the filled dot. */
  .skill.exp .dot {
    border-color: var(--accent);
    background: var(--accent);
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 5px var(--accent);
  }

  .name {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.2;
  }

  .name b {
    font-weight: 600;
  }

  .name small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .skill.on small {
    color: var(--accent);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: 0.75rem;
  }

  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    min-height: 48px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
  }

  .pill:has(button) {
    padding-right: 0.0625rem;
  }

  .pill small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .icon {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border-radius: 999px;
  }

  .add {
    min-height: 44px;
    border-style: dashed;
    border-radius: 999px;
    color: var(--accent);
  }

  .note {
    margin: 0.5rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .training {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.375rem 0;
    border-top: 1px solid var(--line);
  }

  .label {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .chip {
    min-width: 44px;
    color: var(--ink-muted);
  }

  .chip[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }

  .other {
    flex: 1 1 12rem;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  @media (max-width: 1099px) {
    .skills {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 899px) {
    .training {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
