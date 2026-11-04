<!--
  Abilities, saving throws and skills: on screen all the time on a laptop (the right column), a tab of
  its own on the iPad in portrait. A dot marks proficiency, a ring around it expertise. Tapping a skill
  marks it with advantage or disadvantage (the owner chose this, 2026-10-31); a saving throw the same
  way (M6.5 fix round).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { ARROW, edgeOf } from '../../play/edge.ts';
  import EdgePopUp from './EdgePopUp.svelte';
  import { readAbilities, readSkills, readTool } from '../../play/read.ts';
  import type { AbilityKey, Advantage, SkillKey } from '../../play/read.ts';
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
  const label = (e: 'adv' | 'dis'): string => (e === 'adv' ? t.advantage : t.disadvantage);
  const edges = $derived([...abilities, ...skills].map(edgeOf).filter((e): e is 'adv' | 'dis' => e !== ''));
  const legend = $derived((['adv', 'dis'] as const).filter((e) => edges.includes(e)));

  /** The skill or saving throw whose pop-up is open. */
  let marking: { kind: 'skill'; key: SkillKey } | { kind: 'save'; key: AbilityKey } | null = $state(null);
  /** The row that opened it: focus goes back there, or a keyboard user would start again at the top. */
  let opener: HTMLButtonElement | null = null;

  function open(what: NonNullable<typeof marking>, row: HTMLButtonElement) {
    opener = row;
    marking = what;
  }

  /** Focus can only move once the pop-up is gone: while it is open, the page behind it is inert. */
  async function close() {
    marking = null;
    await tick();
    opener?.focus();
    opener = null;
  }
  /**
   * What the pop-up marks: its title, the roll, its state and the prefix of MPMB's boxes ("Ste" for
   * "Ste Adv", "Str ST" for "Str ST Adv").
   */
  const marked = $derived.by(() => {
    const at = marking;
    if (at?.kind === 'skill') {
      const s = skills.filter((x) => x.key === at.key)[0];
      if (!s) return null;
      return { title: t[`skill${s.key}`], roll: `${t[`short${s.ability}`]} ${s.bonus}`, state: s, boxes: s.key };
    }
    if (at?.kind === 'save') {
      const a = abilities.filter((x) => x.key === at.key)[0];
      if (!a) return null;
      const title = fill(t.saveTitle, { ability: t[`ability${a.key}`] });
      return { title, roll: `${t.save} ${a.save}`, state: a as Advantage, boxes: `${a.key} ST` };
    }
    return null;
  });
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
        {@const e = edgeOf(a)}
        <tr>
          <th scope="row">{t[`ability${a.key}`]}</th>
          <td class="score">{a.score}</td>
          <td class="num">{a.modifier}</td>
          <td class="num">
            <button
              type="button"
              class="save"
              aria-haspopup="dialog"
              aria-label={`${fill(t.saveTitle, { ability: t[`ability${a.key}`] })} ${a.save}${e ? `, ${label(e)}` : ''}`}
              onclick={(ev) => open({ kind: 'save', key: a.key }, ev.currentTarget)}
            >
              <span class="prof" class:no={!a.saveProficient} title={a.saveProficient ? t.proficient : undefined}
              ></span>{a.save}
              {#if e}<span class="edge {e}" aria-label={label(e)}>{ARROW[e]}</span>{/if}
            </button>
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
      {@const e = edgeOf(s)}
      <li>
        <button
          type="button"
          class="skill"
          aria-haspopup="dialog"
          onclick={(ev) => open({ kind: 'skill', key: s.key }, ev.currentTarget)}
        >
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
  <EdgePopUp
    title={marked.title}
    roll={marked.roll}
    state={marked.state}
    boxes={marked.boxes}
    {disabled}
    {change}
    onclose={() => void close()}
    {t}
  />
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

  /* The save opens the same pop-up as a skill: a 44 px button filling its cell. */
  .save {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    width: calc(100% + 0.5rem);
    min-height: 44px;
    margin: 0 -0.25rem;
    padding: 0 0.25rem;
    border: 0;
    border-radius: 0.375rem;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .save:hover,
  .save:focus-visible {
    background: var(--hover);
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
