<!--
  Build step "Armour & weapons" (M6.5, Nick picked a Build step, 2026-11-02): the armour, the shield and
  the sheet's attack rows. Every choice goes into MPMB's own fields ("AC Armor Description", "AC Shield
  Bonus Description", "Attack.N.Weapon Selection"), and MPMB's scripts work out AC, to hit and damage as
  they do in Acrobat. The lists are MPMB's own drop-downs (gear.ts in the engine).
-->
<script lang="ts">
  import {
    ARMOUR_FIELD,
    SHIELD_FIELD,
    MAX_MAGIC,
    armourNamed,
    damageText,
    readShield,
    shieldText,
    takesMagic,
    trainedWith,
    weaponField,
    weaponNamed,
    weaponRows,
    weightText,
    withMagic,
  } from '../../build/gear.ts';
  import type { GearOption } from '../../build/gear.ts';
  import { readProficiencies } from '../../build/proficiencies.ts';
  import type { BuilderInfo } from '../../engine/builder.ts';
  import type { ArmourEntry, ArmourGroup, WeaponEntry, WeaponGroup } from '../../engine/gear.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { shown, valueOf } from '../../play/read.ts';
  import type { Step } from '../../session.svelte.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import GearPick from './GearPick.svelte';

  interface Props {
    info: BuilderInfo;
    fields: FieldViews;
    disabled: boolean;
    change: (steps: Step[]) => void;
    t: Texts;
  }

  let { info, fields, disabled, change, t }: Props = $props();

  /** The open list: armour, or the attack row a weapon goes into. */
  let picking = $state<{ kind: 'armour' } | { kind: 'weapon'; row: number } | null>(null);

  const gear = $derived(info.gear);
  const prof = $derived(readProficiencies(fields));
  const armour = $derived(valueOf(fields, ARMOUR_FIELD));
  const armourEntry = $derived(armour ? armourNamed(gear, armour) : null);
  const shield = $derived(readShield(fields));
  const rows = $derived(weaponRows(fields));

  const ARMOUR_GROUPS: ArmourGroup[] = ['own', 'none', 'light', 'medium', 'heavy', 'other'];
  const WEAPON_GROUPS: WeaponGroup[] = [
    'own',
    'simple-melee',
    'martial-melee',
    'simple-ranged',
    'martial-ranged',
    'natural',
    'spell',
    'gear',
    'other',
  ];

  const trainedText = (keys: string[]): string =>
    keys.length ? fill(t.gearTrainedIn, { list: keys.map((k) => t[`prof_${k}` as keyof Texts]).join(', ') }) : '';

  function armourLine(entry: ArmourEntry): string {
    const ac = entry.ac === null ? '' : fill(t.gearAc, { ac: entry.ac });
    const dex = { all: ` ${t.gearDexAll}`, max2: ` ${t.gearDexMax2}`, none: '' }[entry.dex];
    return [
      ac && `${ac}${dex}`,
      entry.strength ? fill(t.gearStrength, { n: entry.strength }) : '',
      weightText(entry.weight, gear.massUnit, t.locale),
      entry.stealth ? t.gearStealth : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  const weaponLine = (entry: WeaponEntry): string =>
    [damageText(entry.damage), entry.range, entry.properties, entry.mastery].filter(Boolean).join(' · ');

  function groupsOf<E extends ArmourEntry | WeaponEntry>(
    entries: E[],
    order: E['group'][],
    line: (entry: E) => string,
  ): { title: string; options: GearOption[] }[] {
    return order
      .map((group) => ({
        title: t[`gearGroup_${group}` as keyof Texts],
        options: entries
          .filter((e) => e.group === group)
          .map((e) => ({
            name: e.name,
            line: line(e),
            untrained: trainedWith(e, prof) === false,
            magic: takesMagic(e),
          })),
      }))
      .filter((g) => g.options.length);
  }

  /** What a filled attack row shows: MPMB's to hit and damage, its range and notes, the mastery. */
  function attackOf(row: number) {
    const name = valueOf(fields, weaponField(row));
    const entry = name ? weaponNamed(gear, name) : null;
    const notes = [valueOf(fields, `Attack.${row}.Range`), valueOf(fields, `Attack.${row}.Description`)]
      .filter(Boolean)
      .join(', ');
    return {
      name,
      line: [entry?.type, notes, entry?.mastery].filter(Boolean).join(' · '),
      toHit: shown(fields, `Attack.${row}.To Hit`).trim(),
      damage: shown(fields, `Attack.${row}.Damage`).trim(),
      damageType: valueOf(fields, `Attack.${row}.Damage Type`).trim(),
    };
  }

  const setShield = (on: boolean, bonus: number) => change([{ edit: SHIELD_FIELD, text: shieldText(on, bonus) }]);

  function take(name: string, bonus: number) {
    const open = picking;
    picking = null;
    if (open?.kind === 'armour') change([{ edit: ARMOUR_FIELD, text: name }]);
    else if (open?.kind === 'weapon') change([{ edit: weaponField(open.row), text: withMagic(name, bonus) }]);
  }
</script>

<section class="card" aria-labelledby="armour-title">
  <header class="head">
    <div>
      <h2 id="armour-title">{t.gearArmourTitle}</h2>
      <p class="line">{trainedText(prof.armour)}</p>
    </div>
    <span class="ac" aria-label={fill(t.gearArmourLine, { ac: shown(fields, 'AC') })}
      ><small>{t.gearAcShort}</small>{shown(fields, 'AC')}</span
    >
  </header>

  <div class="field">
    <span class="label">{t.gearArmour}</span>
    <div class="inline">
      <button type="button" class="pick" {disabled} onclick={() => (picking = { kind: 'armour' })}>
        <b>{armour || t.gearNoArmour}</b>
        <small>{armourEntry ? armourLine(armourEntry) : armour ? '' : t.gearChooseArmour}</small>
      </button>
      {#if armour}
        <button
          type="button"
          class="quiet icon"
          aria-label={t.gearRemoveArmour}
          title={t.gearRemoveArmour}
          {disabled}
          onclick={() => change([{ edit: ARMOUR_FIELD, text: '' }])}>✕</button
        >
      {/if}
    </div>
  </div>

  <div class="field">
    <span class="label" id="shield-label">{t.gearShield}</span>
    {#if shield.other}
      <p class="other"><b>{shield.other}</b> <small>{t.gearFromItem}</small></p>
    {:else}
      <div class="inline">
        <div class="seg" role="group" aria-labelledby="shield-label">
          <button type="button" aria-pressed={!shield.on} {disabled} onclick={() => setShield(false, 0)}
            >{t.gearNoShield}</button
          >
          <button type="button" aria-pressed={shield.on} {disabled} onclick={() => setShield(true, shield.bonus)}
            >{t.gearShield}</button
          >
        </div>
        {#if shield.on}
          <span class="bonus">
            <span class="muted">{t.gearMagicBonus}</span>
            <button
              type="button"
              class="icon"
              aria-label={t.gearLessBonus}
              disabled={disabled || shield.bonus <= 0}
              onclick={() => setShield(true, shield.bonus - 1)}>−</button
            >
            <b class="n">+{shield.bonus}</b>
            <button
              type="button"
              class="icon"
              aria-label={t.gearMoreBonus}
              disabled={disabled || shield.bonus >= MAX_MAGIC}
              onclick={() => setShield(true, shield.bonus + 1)}>+</button
            >
          </span>
        {/if}
      </div>
    {/if}
  </div>
  <p class="note">{t.gearMagicNote}</p>
</section>

<section class="card" aria-labelledby="weapons-title">
  <header class="head">
    <div>
      <h2 id="weapons-title">{t.gearWeaponsTitle}</h2>
      <p class="line">{t.gearWeaponsLine}</p>
    </div>
  </header>
  <ol class="weapons">
    {#each rows as row (row)}
      {@const attack = attackOf(row)}
      <li class="weapon" class:empty={!attack.name}>
        <span class="n" aria-hidden="true">{row}</span>
        {#if attack.name}
          <span class="name"><b>{attack.name}</b><small>{attack.line}</small></span>
          <span class="nums">
            {#if attack.toHit}<span class="hit" title={t.gearToHit}>{attack.toHit}</span>{/if}
            {#if attack.damage}<span class="dmg" title={t.gearDamage}
                >{attack.damage}<small>{attack.damageType}</small></span
              >{/if}
          </span>
          <span class="acts">
            <button
              type="button"
              aria-label={fill(t.gearChangeWeapon, { name: attack.name })}
              {disabled}
              onclick={() => (picking = { kind: 'weapon', row })}>{t.gearChange}</button
            >
            <button
              type="button"
              class="quiet icon"
              aria-label={fill(t.gearRemoveWeapon, { name: attack.name })}
              title={fill(t.gearRemoveWeapon, { name: attack.name })}
              {disabled}
              onclick={() => change([{ edit: weaponField(row), text: '' }])}>✕</button
            >
          </span>
        {:else}
          <button type="button" class="add" {disabled} onclick={() => (picking = { kind: 'weapon', row })}
            >+ {t.gearAddWeapon}</button
          >
        {/if}
      </li>
    {/each}
  </ol>
</section>

{#if picking?.kind === 'armour'}
  <GearPick
    title={t.gearChooseArmour}
    line={[t.gearListLine, trainedText(prof.armour)].filter(Boolean).join(' ')}
    groups={groupsOf(gear.armour, ARMOUR_GROUPS, armourLine)}
    current={armour}
    magic={false}
    placeholder={t.gearTypeArmour}
    ontake={take}
    onclose={() => (picking = null)}
    {t}
  />
{:else if picking?.kind === 'weapon'}
  <GearPick
    title={fill(t.gearWeaponFor, { n: picking.row })}
    line={[t.gearListLine, trainedText(prof.weapons)].filter(Boolean).join(' ')}
    groups={groupsOf(gear.weapons, WEAPON_GROUPS, weaponLine)}
    current={valueOf(fields, weaponField(picking.row))}
    magic={true}
    placeholder={t.gearTypeWeapon}
    ontake={take}
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
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }

  .line {
    margin: 0.125rem 0 0;
    color: var(--ink-muted);
  }

  .ac {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 4rem;
    padding: 0.25rem 0.5rem;
    border: 2px solid var(--accent);
    border-radius: 0.75rem 0.75rem 1.5rem 1.5rem;
    color: var(--accent);
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1.1;
  }

  .ac small {
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .field {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 0.25rem 0.75rem;
    align-items: center;
    padding: 0.5rem 0;
    border-top: 1px solid var(--line);
  }

  .label {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .inline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
  }

  .pick {
    display: grid;
    flex: 1 1 16rem;
    min-width: 0;
    min-height: 56px;
    padding: 0.375rem 0.75rem;
    border-radius: 0.625rem;
    text-align: left;
    line-height: 1.25;
  }

  .pick small,
  .muted,
  .other small {
    color: var(--ink-muted);
    font-size: 0.875rem;
    font-weight: 400;
  }

  .other {
    margin: 0;
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

  .bonus {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .bonus .n {
    min-width: 2rem;
    text-align: center;
  }

  .icon {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
  }

  .note {
    margin: 0.5rem 0 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    font-size: 0.875rem;
  }

  .weapons {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .weapon {
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr) auto auto;
    gap: 0.75rem;
    align-items: center;
    min-height: 56px;
    padding: 0.25rem 0.5rem 0.25rem 0.75rem;
    border: 1px solid var(--line);
    border-radius: 0.625rem;
  }

  .weapon.empty {
    grid-template-columns: 1.75rem minmax(0, 1fr);
    border-style: dashed;
  }

  .n {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .name {
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }

  .name small {
    color: var(--ink-muted);
    font-size: 0.8125rem;
  }

  .nums {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .hit,
  .dmg {
    padding: 0.125rem 0.5rem;
    border-radius: 0.5rem;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
    white-space: nowrap;
  }

  .dmg small {
    margin-left: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .acts {
    display: flex;
    gap: 0.25rem;
  }

  .add {
    justify-self: start;
    min-height: 44px;
    border-style: dashed;
    color: var(--accent);
  }

  /* The iPad upright: the numbers go under the name. */
  @media (max-width: 899px) {
    .weapon {
      grid-template-columns: 1.75rem minmax(0, 1fr) auto;
    }

    .nums {
      grid-column: 2;
      grid-row: 2;
    }

    .acts {
      grid-column: 3;
      grid-row: 1 / span 2;
    }

    .field {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
