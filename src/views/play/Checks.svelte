<!--
  Abilities, saving throws and skills: on screen all the time on a laptop (the right column), a tab of
  its own on the iPad in portrait. A dot marks proficiency, a ring around it expertise. Tapping a skill
  marks it with advantage or disadvantage (the owner chose this, 2026-10-31).
-->
<script lang="ts">
  import type { Texts } from '../../i18n.ts';
  import Modal from '../../popups/Modal.svelte';
  import { readAbilities, readSkills, readTool } from '../../play/read.ts';
  import type { Advantage, Skill, SkillKey } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';

  interface Props {
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { fields, disabled, change, t }: Props = $props();

  const abilities = $derived(readAbilities(fields));
  const skills = $derived(readSkills(fields));
  const tool = $derived(readTool(fields));
  /**
   * Advantage or disadvantage on a save or skill as a small arrow (both cancel out, as in the rules).
   * A condition can give every skill one (Poisoned), so a word each would crowd the list; the panel
   * head names what the arrows mean.
   */
  const edge = (a: Advantage): '' | 'adv' | 'dis' =>
    a.advantage === a.disadvantage ? '' : a.advantage ? 'adv' : 'dis';
  const ARROW = { adv: '▲', dis: '▼' };
  const label = (e: 'adv' | 'dis'): string => (e === 'adv' ? t.advantage : t.disadvantage);
  const edges = $derived([...abilities, ...skills].map(edge).filter((e): e is 'adv' | 'dis' => e !== ''));
  const legend = $derived((['adv', 'dis'] as const).filter((e) => edges.includes(e)));

  /** The skill whose pop-up is open. */
  let marking: SkillKey | null = $state(null);
  const marked = $derived(skills.filter((s) => s.key === marking)[0]);
  type Mark = '' | 'adv' | 'dis';
  const CHOICES: [Mark, 'rollNormal' | 'rollAdvantage' | 'rollDisadvantage'][] = [
    ['', 'rollNormal'],
    ['adv', 'rollAdvantage'],
    ['dis', 'rollDisadvantage'],
  ];

  /**
   * The PDF's own check boxes ("Ste Adv", "Ste Dis") hold the mark, so it stays in the sheet and in a
   * printed PDF. Ticking one makes MPMB untick the other (SetDisAdv); Normal unticks what is ticked.
   * The armour's disadvantage on Stealth is one of these boxes too, set by MPMB.
   */
  function mark(skill: Skill, to: Mark) {
    const steps: Step[] = [];
    if (to === 'adv' && !skill.advantage) steps.push({ click: `${skill.key} Adv` });
    if (to === 'dis' && !skill.disadvantage) steps.push({ click: `${skill.key} Dis` });
    if (to === '' && skill.advantage) steps.push({ click: `${skill.key} Adv` });
    if (to === '' && skill.disadvantage) steps.push({ click: `${skill.key} Dis` });
    if (steps.length) change(steps);
    marking = null;
  }
</script>

<section class="panel" aria-labelledby="abilities-title">
  <div class="head">
    <h2 id="abilities-title">{t.abilitiesSaves}</h2>
    {#if legend.length}
      <span class="muted"
        >{#each legend as e (e)}<span class="edge {e}" aria-hidden="true">{ARROW[e]}</span> {label(e)}
        {/each}</span
      >
    {/if}
  </div>
  <table>
    <thead>
      <tr><th></th><th>{t.score}</th><th class="num">{t.modifier}</th><th class="num">{t.save}</th></tr>
    </thead>
    <tbody>
      {#each abilities as a (a.key)}
        {@const e = edge(a)}
        <tr>
          <th scope="row">{t[`ability${a.key}`]}</th>
          <td class="score">{a.score}</td>
          <td class="num">{a.modifier}</td>
          <td class="num">
            <span class="prof" class:no={!a.saveProficient} title={a.saveProficient ? t.proficient : undefined}
            ></span>{a.save}
            {#if e}<span class="edge {e}" aria-label={label(e)}>{ARROW[e]}</span>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<section class="panel skills-panel" aria-labelledby="skills-title">
  <div class="head">
    <h2 id="skills-title">{t.skills}</h2>
    {#if tool}<span class="muted">{tool.name} {tool.bonus}</span>{/if}
  </div>
  <ul class="skills">
    {#each skills as s (s.key)}
      {@const e = edge(s)}
      <li>
        <button type="button" class="skill" aria-haspopup="dialog" onclick={() => (marking = s.key)}>
          <span>
            <span class="prof" class:no={!s.proficient} class:exp={s.expertise}></span>{t[`skill${s.key}`]}
            <span class="ability">{t[`short${s.ability}`]}</span>
            {#if e}<span class="edge {e}" aria-label={label(e)}>{ARROW[e]}</span>{/if}
          </span>
          <b>{s.bonus}</b>
        </button>
      </li>
    {/each}
  </ul>
</section>

{#if marked}
  {@const current = edge(marked)}
  <Modal title={t[`skill${marked.key}`]} onescape={() => (marking = null)} closeLabel={t.close}>
    <p class="roll">{t[`short${marked.ability}`]} {marked.bonus}</p>
    <div class="choices">
      {#each CHOICES as [to, text] (to)}
        <button
          type="button"
          class="choice {to}"
          aria-pressed={current === to}
          {disabled}
          onclick={() => mark(marked, to)}
          >{#if to}<span aria-hidden="true">{ARROW[to]}</span>{/if}
          {t[text]}</button
        >
      {/each}
    </div>
    <p class="hint">{t.edgeHint}</p>
  </Modal>
{/if}

<style>
  .panel {
    margin-bottom: 0.625rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    background: var(--surface);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
  }

  .muted {
    color: var(--ink-muted);
    font-size: 0.875rem;
    text-align: right;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  thead th {
    padding: 0 0.25rem 0.25rem;
    color: var(--ink-muted);
    font-size: 0.8125rem;
    font-weight: 500;
    text-align: left;
  }

  tbody th {
    font-weight: 700;
    text-align: left;
  }

  tbody th,
  td {
    height: 36px;
    padding: 0.125rem 0.25rem;
    border-top: 1px solid var(--line);
  }

  .score {
    color: var(--ink-muted);
    font-size: 0.9375rem;
  }

  .num {
    font-size: 1.125rem;
    font-weight: 800;
    text-align: right;
    white-space: nowrap;
  }

  thead .num {
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .prof {
    display: inline-block;
    width: 0.5rem;
    height: 0.5rem;
    margin-right: 0.375rem;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: 0.1rem;
  }

  .prof.no {
    background: transparent;
    box-shadow: inset 0 0 0 1.5px var(--used);
  }

  .prof.exp {
    box-shadow:
      0 0 0 2px var(--accent-soft),
      0 0 0 3.5px var(--accent);
  }

  .edge {
    margin-left: 0.25rem;
    color: var(--ok);
    font-size: 0.6875rem;
  }

  .edge.dis {
    color: var(--hp);
  }

  .skills {
    columns: 2;
    column-gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .skills li {
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
    font-size: 0.9375rem;
    line-height: 1.2;
    break-inside: avoid;
  }

  /* The whole row is the button: 44 px tall, so it is easy to hit at the table. */
  .skill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    width: calc(100% + 0.75rem);
    min-height: 44px;
    margin: 0 -0.375rem;
    padding: 0 0.375rem;
    border: 0;
    border-radius: 0.375rem;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .skill:hover,
  .skill:focus-visible {
    background: var(--hover);
  }

  .roll {
    margin: 0 0 0.75rem;
    color: var(--ink-muted);
  }

  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    padding: 0 0.875rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    text-align: left;
    cursor: pointer;
  }

  .choice.adv {
    color: var(--ok);
  }

  .choice.dis {
    color: var(--hp);
  }

  .choice[aria-pressed='true'] {
    border-color: currentColor;
    background: var(--accent-soft);
  }

  .choice.adv[aria-pressed='true'] {
    background: color-mix(in srgb, var(--ok) 14%, var(--surface));
  }

  .choice.dis[aria-pressed='true'] {
    background: var(--hp-soft);
  }

  .choice:hover:not(:disabled, [aria-pressed='true']) {
    background: var(--hover);
  }

  .hint {
    margin: 0.75rem 0 0;
    color: var(--ink-muted);
    font-size: 0.875rem;
  }

  .ability {
    margin-left: 0.125rem;
    color: var(--ink-muted);
    font-size: 0.75rem;
  }

  .skills b {
    font-weight: 800;
  }

  /*
   * In the laptop's right column long skill names (German "Mit Tieren umgehen") would wrap: the
   * ability abbreviation goes and the text gets a step smaller there.
   */
  .skills-panel {
    container-type: inline-size;
  }

  @container (max-width: 25rem) {
    .ability {
      display: none;
    }

    .skills li {
      font-size: 0.875rem;
    }
  }
</style>
