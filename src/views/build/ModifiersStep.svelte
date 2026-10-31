<!--
  Build step 7: the modifiers (M6, as drawn): MPMB's blue fields, where the player adds to what MPMB
  works out, in four groups. Each takes what the PDF's field takes (a number, or an ability such as "Cha",
  see MPMB's tooltips) and goes onto the sheet when the player leaves the field, as typing in the PDF
  would; next to it what MPMB makes of it. The six saves and the 18 skills one by one are folded away:
  most characters never need them.
-->
<script lang="ts">
  import {
    ALL_SAVES,
    ALL_SKILLS,
    ARMOR_CLASS,
    INITIATIVE,
    PASSIVE_PERCEPTION,
    PROFICIENCY,
    SAVES,
    SKILL_MODIFIERS,
    isSet,
    saveDcs,
  } from '../../build/modifiers.ts';
  import type { Modifier } from '../../build/modifiers.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { shown, valueOf } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const dcs = $derived(saveDcs(fields));
  const savesSet = $derived(SAVES.filter((s) => isSet(fields, s.modifier)).length);
  const skillsSet = $derived(SKILL_MODIFIERS.filter((s) => isSet(fields, s.modifier)).length);

  /** MPMB's empty value is "0" for most blue fields: shown as an empty box with "+0" in it. */
  const valueIn = (modifier: Modifier): string => (isSet(fields, modifier) ? valueOf(fields, modifier.field) : '');

  function write(field: string, text: string) {
    if (text.trim() === valueOf(fields, field).trim()) return;
    change([{ edit: field, text: text.trim() }]);
  }
</script>

{#snippet row(modifier: Modifier, label: string, opts: { hint?: string; locked?: string } = {})}
  <div class="row">
    <label class="what" for={modifier.field}>
      <span>{label}</span>
      {#if opts.locked}
        <small>{opts.locked}</small>
      {:else if opts.hint}
        <small>{opts.hint}</small>
      {/if}
      {#if modifier.result && shown(fields, modifier.result)}
        <small class="result">{fill(t.buildModResult, { value: shown(fields, modifier.result) })}</small>
      {/if}
    </label>
    <input
      id={modifier.field}
      class="value"
      class:set={isSet(fields, modifier)}
      type="text"
      autocomplete="off"
      spellcheck="false"
      placeholder="+0"
      value={valueIn(modifier)}
      disabled={disabled || Boolean(opts.locked)}
      onchange={(e) => write(modifier.field, e.currentTarget.value)}
    />
    {#if modifier.name}
      <input
        class="name"
        type="text"
        autocomplete="off"
        aria-label={fill(t.buildModNameOf, { what: label })}
        placeholder={t.buildModNamePlaceholder}
        value={valueOf(fields, modifier.name)}
        {disabled}
        onchange={(e) => write(modifier.name, e.currentTarget.value)}
      />
    {/if}
  </div>
{/snippet}

<section class="card">
  <h2>{t.buildModifiers}</h2>
  <p class="line">{t.buildModifiersLine}</p>
  <div class="tiles">
    <div class="tile">
      <h3>{t.buildModArmorInitiative}</h3>
      {#each ARMOR_CLASS as modifier, i (modifier.field)}
        {@render row(modifier, fill(t.buildModArmorExtra, { n: String(i + 1) }))}
      {/each}
      {@render row(INITIATIVE, t.initiative)}
    </div>

    <div class="tile">
      <h3>{t.buildModSaves}</h3>
      {@render row(ALL_SAVES, t.buildModAllSaves, { hint: t.buildModAllSavesHint })}
      <details>
        <summary>
          <span>{t.buildModEachSave}</span>
          <small>{savesSet ? fill(t.buildModSetCount, { n: String(savesSet) }) : t.buildModOpenList}</small>
        </summary>
        {#each SAVES as save (save.key)}
          {@render row(save.modifier, t[`ability${save.key}`])}
        {/each}
      </details>
    </div>

    <div class="tile">
      <h3>{t.buildModSkillsSenses}</h3>
      {@render row(ALL_SKILLS, t.buildModAllSkills)}
      <details>
        <summary>
          <span>{t.buildModEachSkill}</span>
          <small>{skillsSet ? fill(t.buildModSetCount, { n: String(skillsSet) }) : t.buildModOpenList}</small>
        </summary>
        {#each SKILL_MODIFIERS as skill (skill.key)}
          {@render row(skill.modifier, t[`skill${skill.key}`])}
        {/each}
      </details>
      {@render row(PASSIVE_PERCEPTION, t.passivePerception)}
    </div>

    <div class="tile">
      <h3>{t.buildModSpellsProficiency}</h3>
      {#each dcs as dc (dc.modifier.field)}
        {@render row(dc.modifier, fill(t.buildModSaveDc, { ability: t[`ability${dc.ability}`] }), {
          locked: dc.linked ? t.buildModSaveDcLinked : undefined,
        })}
      {/each}
      {@render row(PROFICIENCY, t.buildModProficiency)}
    </div>
  </div>
</section>

<style>
  .card {
    min-width: 0;
    padding: 1rem 1.25rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .line {
    margin: 0.125rem 0 1rem;
    color: var(--ink-muted);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 0.75rem;
    align-items: start;
  }

  .tile {
    min-width: 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
  }

  h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6.5rem;
    gap: 0.375rem 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }

  h3 + .row {
    border-top: 0;
  }

  .what {
    display: grid;
    min-width: 0;
    line-height: 1.3;
  }

  .what small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .what small.result {
    color: var(--accent);
    font-weight: 600;
  }

  input {
    min-width: 0;
    min-height: 44px;
    padding: 0 0.625rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
  }

  .value {
    text-align: center;
  }

  /* A set modifier stands out like MPMB's blue text. */
  .value.set {
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }

  .name {
    grid-column: 1 / -1;
  }

  input:disabled {
    opacity: 0.55;
  }

  details {
    border-top: 1px solid var(--line);
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 48px;
    cursor: pointer;
  }

  summary small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  details[open] summary {
    font-weight: 700;
  }

  details .row {
    padding-left: 0.75rem;
  }
</style>
