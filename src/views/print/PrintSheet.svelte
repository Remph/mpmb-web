<!--
  The app's own print layout (M10): the character on A4 paper, in the app's look, not the PDF's.
  CharacterView mounts it only while the browser prints (`beforeprint` to `afterprint`), and `@media print`
  in app.css hides everything else, so the browser's own print dialog does the paging, the paper size and
  "Save as PDF".
  The compact layout the owner picked (2026-11-03): what a turn needs on the first page, the long texts in two
  columns, the short parts sharing a sheet. With `blank`, what changes during play
  (current hit points, used uses and slots) is left empty for a pencil.
-->
<script lang="ts">
  import { hasProficiencies, moreProficiencies, readProficiencies } from '../../build/proficiencies.ts';
  import type { SheetImages } from '../../engine/types.ts';
  import { fill } from '../../i18n.ts';
  import type { Texts } from '../../i18n.ts';
  import { DEFAULT_NOTES_TITLE } from '../../play/notes.ts';
  import { filledNotesPages, marks, poolLeft, spellMarks } from '../../play/print.ts';
  import type { PrintPart } from '../../play/print.ts';
  import {
    attacksPerAction,
    isOn,
    readAbilities,
    readActions,
    readAttacks,
    readDefenses,
    readFeatures,
    readHitPoints,
    readInventory,
    readLimitedFeatures,
    readNumbers,
    readSkills,
    readSpellSlotUse,
    readTool,
    textRuns,
    valueOf,
    MAX_DOTS,
  } from '../../play/read.ts';
  import { recoveryText, spellLevelName } from '../../play/labels.ts';
  import { readSpells } from '../../play/spells.ts';
  import type { Spell } from '../../play/spells.ts';
  import type { FieldViews } from '../../worker/views.ts';
  import RichText from '../play/RichText.svelte';

  interface Props {
    fields: FieldViews;
    images: SheetImages;
    parts: PrintPart[];
    blank: boolean;
    t: Texts;
  }

  let { fields, images, parts, blank, t }: Props = $props();
  const has = (part: PrintPart): boolean => parts.includes(part);

  const name = $derived(valueOf(fields, 'PC Name') || t.unnamed);
  const subline = $derived(
    [
      valueOf(fields, 'Class and Levels'),
      valueOf(fields, 'Race'),
      valueOf(fields, 'Background'),
      valueOf(fields, 'Alignment'),
    ].filter(Boolean),
  );
  const level = $derived(valueOf(fields, 'Character Level'));
  const xp = $derived(valueOf(fields, 'Total Experience'));
  const hp = $derived(readHitPoints(fields));
  const numbers = $derived(readNumbers(fields));
  const abilities = $derived(readAbilities(fields));
  const skills = $derived(readSkills(fields));
  const tool = $derived(readTool(fields));
  const attacks = $derived(readAttacks(fields));
  const perAction = $derived(attacksPerAction(fields));
  const actions = $derived(readActions(fields));
  const limited = $derived(readLimitedFeatures(fields));
  const slots = $derived(readSpellSlotUse(fields));
  const defenses = $derived(readDefenses(fields));
  const profs = $derived(readProficiencies(fields));
  const features = $derived(readFeatures(fields));
  const inventory = $derived(readInventory(fields));
  const spells = $derived(readSpells(fields));
  const notes = $derived(filledNotesPages(fields));
  const inspiration = $derived(isOn(fields, 'Inspiration'));

  const profRows = $derived(
    [
      { label: t.profArmour, items: [...profs.armour.map((k) => t[`prof_${k}`]), profs.otherArmour] },
      { label: t.profWeapons, items: [...profs.weapons.map((k) => t[`prof_${k}`]), profs.otherWeapons] },
      { label: t.profTools, items: profs.tools },
      { label: t.profLanguages, items: profs.languages },
      { label: t.profMore, items: moreProficiencies(profs) },
    ]
      .map((row) => ({ ...row, items: row.items.filter(Boolean) }))
      .filter((row) => row.items.length),
  );
  const defenseRows = $derived(
    [
      { label: t.senses, items: defenses.senses },
      { label: t.resistances, items: defenses.resistances },
      ...defenses.labelled.map((card) => ({
        label: card.title === 'Immunities' ? t.immunities : t.advantageAgainst,
        items: card.items,
      })),
    ].filter((row) => row.items.length),
  );

  const circles = (total: number, used: number): boolean[] => marks(total, used, blank);

  const FACTS = $derived([
    ['Age', t.age],
    ['Height', t.height],
    ['Weight', t.weight],
    ['Sex', t.gender],
    ['Eyes colour', t.eyes],
    ['Hair colour', t.hair],
    ['Skin colour', t.skin],
  ] as const);
  const PERSONALITY = $derived([
    ['Personality Trait', t.traits],
    ['Ideal', t.ideal],
    ['Bond', t.bond],
    ['Flaw', t.flaw],
  ] as const);
  const text = (field: string): string => valueOf(fields, field).replace(/\r/g, '\n').trim();

  /** "V, S, M" with MPMB's marks for the table's flags: concentration and ritual. */
  const flags = (spell: Spell): string => [spell.concentration ? 'C' : '', spell.ritual ? 'R' : ''].join('');
  /** Which rest gives a free cast back, as the Spells tab says it. */
  const REST = { long: 'restLong', short: 'restShort', day: 'restDay' } as const;
  const shortNumber = (n: number | null): string => (n === null ? '' : String(n));
  const coinLabel = $derived({
    pp: t.coinPpShort,
    gp: t.coinGpShort,
    ep: t.coinEpShort,
    sp: t.coinSpShort,
    cp: t.coinCpShort,
  });
  const hpCurrent = $derived(blank ? '' : shortNumber(hp.current ?? hp.max));
  const hpTemp = $derived(blank ? '' : shortNumber(hp.temp));
  const deathSaveBoxes = [0, 1, 2];
</script>

<div class="print-sheet" aria-hidden="true">
  {#if has('main')}
    <section class="part main">
      <header class="who">
        {#if images.portrait}<img class="portrait" src={images.portrait.src} alt="" />{/if}
        <div>
          <h1>{name}</h1>
          <p>{subline.join(' · ')}</p>
        </div>
        <dl class="level">
          {#if level}<div>
              <dt>{t.printLevel}</dt>
              <dd>{level}</dd>
            </div>{/if}
          {#if xp}<div>
              <dt>{t.printXp}</dt>
              <dd>{xp}</dd>
            </div>{/if}
        </dl>
      </header>

      <dl class="numbers">
        <div>
          <dt>{t.acLabel}</dt>
          <dd>{numbers.armorClass}</dd>
        </div>
        <div>
          <dt>{t.initiative}</dt>
          <dd>{numbers.initiative}</dd>
        </div>
        <div>
          <dt>{t.speed}</dt>
          <dd>{numbers.speed}</dd>
        </div>
        <div>
          <dt>{t.proficiency}</dt>
          <dd>{numbers.proficiency}</dd>
        </div>
        {#each numbers.spellSaveDcs as dc, i (i)}<div>
            <dt>{t.spellSaveDc}</dt>
            <dd>{dc}</dd>
          </div>{/each}
        <div>
          <dt>{t.passivePerception}</dt>
          <dd>{numbers.passivePerception}</dd>
        </div>
        <div class="tick">
          <dt>{t.heroicInspiration}</dt>
          <dd><span class="box" class:on={!blank && inspiration}></span></dd>
        </div>
      </dl>

      <div class="columns">
        <div class="col checks">
          <h2>{t.abilitiesSaves}</h2>
          <table class="abilities">
            <thead>
              <tr><th></th><th>{t.score}</th><th>{t.modifier}</th><th colspan="2">{t.save}</th></tr>
            </thead>
            <tbody>
              {#each abilities as ability (ability.key)}
                <tr>
                  <th>{t[`ability${ability.key}`]}</th>
                  <td>{ability.score}</td>
                  <td class="big">{ability.modifier}</td>
                  <td class="dot"><span class="prof" class:on={ability.saveProficient}></span></td>
                  <td>{ability.save}{ability.advantage ? ' ▲' : ''}{ability.disadvantage ? ' ▼' : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>

          <h2>{t.skills}</h2>
          <ul class="skills">
            {#each skills as skill (skill.key)}
              <li>
                <span class="prof" class:on={skill.proficient} class:double={skill.expertise}></span>
                <span class="skill">{t[`skill${skill.key}`]} <small>{t[`short${skill.ability}`]}</small></span>
                <b>{skill.bonus}</b>{skill.advantage ? ' ▲' : ''}{skill.disadvantage ? ' ▼' : ''}
              </li>
            {/each}
            {#if tool}<li class="tool"><span class="skill">{tool.name}</span><b>{tool.bonus}</b></li>{/if}
          </ul>

          {#if defenseRows.length || defenses.other.length}
            <h2>{t.sensesDefenses}</h2>
            <dl class="rows">
              {#each defenseRows as row (row.label)}
                <div>
                  <dt>{row.label}</dt>
                  <dd>{row.items.join(', ')}</dd>
                </div>
              {/each}
              {#each defenses.other as entry, i (i)}
                <div class="sentence">
                  <dd>
                    {#each textRuns(entry) as run, k (k)}{#if run.bold}<b>{run.text}</b>{:else if run.italic}<i
                          >{run.text}</i
                        >{:else}{run.text}{/if}{/each}
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}

          {#if hasProficiencies(profs)}
            <h2>{t.proficiencies}</h2>
            <dl class="rows">
              {#each profRows as row (row.label)}
                <div>
                  <dt>{row.label}</dt>
                  <dd>{row.items.join(', ')}</dd>
                </div>
              {/each}
            </dl>
          {/if}
        </div>

        <div class="col play">
          <div class="hp">
            <h2>{t.hpTitle}</h2>
            <dl>
              <div>
                <dt>{t.printMaxHp}</dt>
                <dd class="big">{shortNumber(hp.max)}</dd>
              </div>
              <div class="write">
                <dt>{t.hpCurrent}</dt>
                <dd>{hpCurrent}</dd>
              </div>
              <div class="write">
                <dt>{t.printTempHp}</dt>
                <dd>{hpTemp}</dd>
              </div>
            </dl>
            <div class="hp-more">
              <div>
                <span class="label">{t.hitDice}</span>
                {#each hp.hitDice as dice (dice.row)}
                  <span class="dice"
                    >{dice.die}
                    {#each circles(dice.total, dice.used) as on, i (i)}<span class="circle" class:on
                      ></span>{/each}</span
                  >
                {/each}
              </div>
              <div>
                <span class="label">{t.deathSaves}</span>
                <span class="dice"
                  >✓ {#each deathSaveBoxes as i (i)}<span class="circle"></span>{/each}</span
                >
                <span class="dice"
                  >✗ {#each deathSaveBoxes as i (i)}<span class="circle"></span>{/each}</span
                >
              </div>
            </div>
          </div>

          <h2>
            {t.attacks}
            {#if Number(perAction) > 1}<small>{fill(t.attacksPerAction, { count: perAction })}</small>{/if}
          </h2>
          <table class="attacks">
            <thead>
              <tr><th>{t.printName}</th><th>{t.gearToHit}</th><th>{t.gearDamage}</th><th>{t.description}</th></tr>
            </thead>
            <tbody>
              {#each attacks as attack (attack.row)}
                <tr>
                  <td class="name">{attack.name}</td>
                  <td class="big">{attack.toHit}</td>
                  <td>{attack.damage} <small>{attack.damageType}</small></td>
                  <td class="small">{[attack.range, attack.description].filter(Boolean).join('; ')}</td>
                </tr>
              {/each}
              <tr class="empty"><td></td><td></td><td></td><td></td></tr>
            </tbody>
          </table>

          <h2>{t.actions}</h2>
          <dl class="rows">
            {#if actions.bonusAction.length}<div>
                <dt>{t.bonusAction}</dt>
                <dd>{actions.bonusAction.join(', ').replaceAll(' / ', ', ')}</dd>
              </div>{/if}
            {#if actions.reaction.length}<div>
                <dt>{t.reaction}</dt>
                <dd>{actions.reaction.join(', ').replaceAll(' / ', ', ')}</dd>
              </div>{/if}
            {#if actions.action.length}<div>
                <dt>{t.action}</dt>
                <dd>{actions.action.join(', ').replaceAll(' / ', ', ')}</dd>
              </div>{/if}
          </dl>

          {#if limited.length}
            <h2>{t.limitedFeatures}</h2>
            <ul class="limited">
              {#each limited as feature (feature.row)}
                <li>
                  <span class="name">{feature.name} <small>{recoveryText(feature.recovery, t)}</small></span>
                  {#if feature.pool || feature.max === null || feature.max > MAX_DOTS}
                    <span class="pool"
                      ><span class="line">{poolLeft(feature.max, feature.used, blank)}</span> / {feature.maxText}</span
                    >
                  {:else}
                    <span
                      >{#each circles(feature.max, feature.used) as on, i (i)}<span class="circle" class:on
                        ></span>{/each}</span
                    >
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}

          {#if slots.length}
            <h2>{t.spellSlots}</h2>
            <ul class="slots">
              {#each slots as slot (slot.level)}
                <li>
                  <span class="label">{fill(t.slotLevel, { count: slot.level })}</span>
                  {#each circles(slot.total, slot.used) as on, i (i)}<span class="circle" class:on></span>{/each}
                </li>
              {/each}
            </ul>
          {/if}

          <h2>{t.conditions}</h2>
          <div class="lines"><span></span><span></span></div>
        </div>
      </div>
    </section>
  {/if}

  {#if has('features') && features.length}
    <section class="part features">
      <h2 class="part-title">{t.features} <small>{name}</small></h2>
      <div class="flow">
        {#each features as block, i (i)}
          <div class="block">
            {#if block.title}<h3>{block.title}</h3>{/if}
            <RichText text={block.text} />
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if has('spells') && spells.length}
    <section class="part spells">
      <h2 class="part-title">{t.spells} <small>{name}</small></h2>
      {#each spells as source (source.key)}
        <div class="source">
          <h3>
            {source.title}
            <small
              >{[
                source.dc && `${t.spellSaveDcShort} ${source.dc}`,
                source.attack && `${t.spellAttackShort} ${source.attack}`,
                source.prepareMax !== null && fill(t.printPrepareMax, { count: source.prepareMax }),
              ]
                .filter(Boolean)
                .join(' · ')}</small
            >
          </h3>
          <table class="spell-table">
            <thead>
              <tr>
                <th class="mark"></th>
                <th>{t.printName}</th>
                <th>{t.castingTime}</th>
                <th>{t.spellRange}</th>
                <th>{t.spellComponents}</th>
                <th>{t.spellDuration}</th>
                <th>{t.printSpellNotes}</th>
              </tr>
            </thead>
            {#each source.levels as lvl (lvl.level)}
              <tbody>
                <tr class="level-row">
                  <th colspan="7">{spellLevelName(lvl.level, t)}</th>
                </tr>
                {#each lvl.spells as spell (spell.row)}
                  <tr>
                    <td class="mark">
                      {#each spellMarks(spell.mark, blank) as paper, k (k)}{#if paper.kind === 'star'}<span
                            class="always">★</span
                          >{:else}<span class={paper.kind} class:on={paper.on}></span>{/if}{/each}
                    </td>
                    <td class="name">
                      {spell.fullName || spell.name} <small>{flags(spell)}</small>
                      {#if spell.mark.free !== null}<small class="note"
                          >{fill(t.printFreeCast, { rest: t[REST[spell.mark.free]] })}</small
                        >{/if}
                      {#if spell.mark.atWill && lvl.level > 0}<small class="note">{t.spellAtWill}</small>{/if}
                      {#if spell.mark.charges !== null}<small class="note"
                          >{fill(t.spellCharges, { count: spell.mark.charges })}</small
                        >{/if}
                      {#if spell.options.length}<small class="note"
                          >{spell.options.map((option) => option.fullName || option.name).join(', ')}</small
                        >{/if}
                    </td>
                    <td>{spell.time}</td>
                    <td>{spell.range}</td>
                    <td>{spell.components}</td>
                    <td>{spell.duration}</td>
                    <td class="small">{spell.summary}</td>
                  </tr>
                {/each}
              </tbody>
            {/each}
          </table>
        </div>
      {/each}
      <p class="legend">{t.printSpellLegend}</p>
    </section>
  {/if}

  {#if has('inventory')}
    <section class="part inventory">
      <h2 class="part-title">{t.tabInventory} <small>{name}</small></h2>
      <dl class="coins">
        {#each inventory.coins as coin (coin.key)}
          <div>
            <dt>{coinLabel[coin.key]}</dt>
            <dd>{coin.amount}</dd>
          </div>
        {/each}
        {#if inventory.carried}<div class="wide">
            <dt>{t.printCarried}</dt>
            <dd>
              {inventory.capacity
                ? fill(t.carried, { carried: inventory.carried, capacity: inventory.capacity })
                : inventory.carried}
            </dd>
          </div>{/if}
      </dl>
      {#if inventory.magicItems.length}
        <h3>{t.magicItems}</h3>
        <ul class="magic">
          {#each inventory.magicItems as item (item.row)}
            <li>
              <b>{item.name}</b>{#if item.attuned}<small> · {t.attuned}</small>{/if}
              {#if item.description}<span class="small"> {item.description}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      <h3>{t.gear}</h3>
      <table class="gear">
        <thead>
          <tr><th>{t.itemName}</th><th>#</th><th>{t.printWeight}</th><th>{t.itemLocation}</th></tr>
        </thead>
        <tbody>
          {#each inventory.gear as item (`${item.list}${item.row}`)}
            <tr>
              <td class="name">{item.name}</td>
              <td>{item.amount ?? ''}</td>
              <td>{item.weight}</td>
              <td>{item.location}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if text('Extra.Other Holdings')}
        <h3>{t.otherHoldings}</h3>
        <p class="pre">{text('Extra.Other Holdings')}</p>
      {/if}
    </section>
  {/if}

  {#if has('profile')}
    <section class="part profile">
      <h2 class="part-title">{t.tabProfile} <small>{name}</small></h2>
      <div class="profile-top">
        {#if images.portrait}<img class="portrait-large" src={images.portrait.src} alt="" />{/if}
        <dl class="rows facts">
          {#each FACTS as [field, label] (field)}
            {#if text(field)}<div>
                <dt>{label}</dt>
                <dd>{text(field)}</dd>
              </div>{/if}
          {/each}
        </dl>
      </div>
      {#if text('Background_Appearance')}<h3>{t.appearance}</h3>
        <p class="pre">{text('Background_Appearance')}</p>{/if}
      <div class="pairs">
        {#each PERSONALITY as [field, label] (field)}
          {#if text(field)}<div>
              <h3>{label}</h3>
              <p class="pre">{text(field)}</p>
            </div>{/if}
        {/each}
      </div>
      <div class="pairs">
        {#if text('Background_Organisation')}<div>
            <h3>{t.allies}</h3>
            <p class="pre">{text('Background_Organisation')}</p>
          </div>{/if}
        {#if text('Background_Enemies')}<div>
            <h3>{t.enemies}</h3>
            <p class="pre">{text('Background_Enemies')}</p>
          </div>{/if}
      </div>
      {#if images.symbol}<img class="symbol" src={images.symbol.src} alt="" />{/if}
      {#if text('Background_History')}<h3>{t.backstory}</h3>
        <p class="pre flow">{text('Background_History')}</p>{/if}
    </section>
  {/if}

  {#if has('notes')}
    {#each notes as page (page.prefix)}
      <section class="part notes">
        <h2 class="part-title">
          {page.title && page.title !== DEFAULT_NOTES_TITLE ? page.title : t.notes} <small>{name}</small>
        </h2>
        <div class="flow">
          <RichText text={page.left} gaps />
          <RichText text={page.right} gaps />
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  /* Hidden on screen should it ever be there outside printing; app.css hides the app when printing. */
  .print-sheet {
    display: none;
    /* Paper is white whatever the screen's theme: fixed colours, black text, one purple for headings. */
    --p-ink: #111;
    --p-muted: #555;
    --p-line: #999;
    --p-faint: #ccc;
    --p-accent: #3d3290;
    color: var(--p-ink);
    background: #fff;
    font-family: var(--font);
    font-size: 8.5pt;
    line-height: 1.3;
  }

  @media print {
    .print-sheet {
      display: block;
    }
  }

  .part + .part {
    break-before: page;
  }

  /* The short parts (gear, profile, notes) follow each other on the same sheet. */
  .part.inventory + .part,
  .part.profile + .part,
  .part.notes + .part.notes {
    break-before: auto;
    margin-top: 7mm;
  }

  h1 {
    margin: 0;
    font-size: 18pt;
    line-height: 1.1;
  }

  h2 {
    margin: 3mm 0 1mm;
    padding-bottom: 0.5mm;
    border-bottom: 0.75pt solid var(--p-accent);
    color: var(--p-accent);
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    break-after: avoid;
  }

  h2 small {
    margin-left: 2mm;
    color: var(--p-muted);
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  h3 {
    margin: 2mm 0 0.5mm;
    font-size: 9.5pt;
    break-after: avoid;
  }

  h3 small {
    margin-left: 1.5mm;
    color: var(--p-muted);
    font-weight: 400;
  }

  .part-title {
    margin-top: 0;
    font-size: 11pt;
  }

  p {
    margin: 0 0 1mm;
  }

  small,
  .small {
    color: var(--p-muted);
    font-size: 7.5pt;
  }

  .big {
    font-size: 11pt;
    font-weight: 800;
  }

  .pre {
    white-space: pre-line;
  }

  dl,
  dd {
    margin: 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.6mm 1mm;
    border-bottom: 0.5pt solid var(--p-faint);
    text-align: left;
    vertical-align: top;
  }

  thead th {
    color: var(--p-muted);
    font-size: 7pt;
    font-weight: 400;
  }

  tr {
    break-inside: avoid;
  }

  /* Header: portrait, name, class line, level. */
  .who {
    display: flex;
    gap: 3mm;
    align-items: center;
    padding-bottom: 2mm;
    border-bottom: 1.5pt solid var(--p-accent);
  }

  .who > div {
    flex: 1;
  }

  .who p {
    margin: 0.5mm 0 0;
    color: var(--p-muted);
    font-size: 9pt;
  }

  .portrait {
    width: 18mm;
    height: 18mm;
    border-radius: 50%;
    object-fit: cover;
  }

  .level {
    display: flex;
    gap: 2mm;
  }

  .level div,
  .numbers div {
    min-width: 13mm;
    padding: 1mm 1.5mm;
    border: 0.75pt solid var(--p-line);
    border-radius: 1.5mm;
    text-align: center;
  }

  dt {
    color: var(--p-muted);
    font-size: 7pt;
  }

  .level dd,
  .numbers dd {
    font-size: 13pt;
    font-weight: 800;
  }

  .numbers {
    display: flex;
    gap: 1.5mm;
    margin: 2mm 0 1mm;
  }

  .numbers div {
    flex: 1;
  }

  /* Pencil marks: a box, a circle, a line to write on. */
  .box,
  .circle,
  .prof {
    display: inline-block;
    width: 3mm;
    height: 3mm;
    margin-right: 0.8mm;
    border: 0.75pt solid var(--p-ink);
    vertical-align: -0.5mm;
  }

  .box {
    border-radius: 0.5mm;
  }

  .numbers .box {
    width: 4.5mm;
    height: 4.5mm;
    margin-top: 0.5mm;
  }

  .circle,
  .prof {
    border-radius: 50%;
  }

  .prof {
    width: 2mm;
    height: 2mm;
    border-color: var(--p-line);
  }

  .on {
    background: var(--p-ink);
    border-color: var(--p-ink);
    /* Browsers leave backgrounds out of print unless told; these are marks, not decoration. */
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .prof.double {
    box-shadow:
      0 0 0 0.6mm #fff,
      0 0 0 0.9mm var(--p-ink);
  }

  /* Main page: two columns. */
  .columns {
    display: grid;
    grid-template-columns: 68mm 1fr;
    gap: 5mm;
  }

  .abilities th:first-child {
    font-weight: 700;
  }

  .abilities td,
  .abilities thead th {
    text-align: right;
  }

  .abilities .dot {
    width: 3mm;
    padding-left: 3mm;
    text-align: center;
  }

  .skills li {
    display: flex;
    gap: 1mm;
    align-items: baseline;
    padding: 0.35mm 0;
    border-bottom: 0.5pt solid var(--p-faint);
  }

  .skills .skill {
    flex: 1;
  }

  .rows div {
    display: flex;
    gap: 2mm;
    padding: 0.4mm 0;
  }

  .rows dt {
    flex: none;
    width: 22mm;
    padding-top: 0.3mm;
  }

  .hp {
    margin-top: 1mm;
    padding: 1.5mm 2mm 2mm;
    border: 1pt solid var(--p-ink);
    border-radius: 2mm;
  }

  .hp h2 {
    margin-top: 0;
  }

  .hp dl {
    display: flex;
    gap: 2mm;
  }

  .hp dl div {
    flex: 1;
  }

  .hp .write dd {
    min-height: 7mm;
    border-bottom: 0.75pt solid var(--p-ink);
    font-size: 13pt;
    font-weight: 800;
  }

  .hp-more {
    display: flex;
    justify-content: space-between;
    gap: 3mm;
    margin-top: 1.5mm;
  }

  .label {
    margin-right: 1.5mm;
    color: var(--p-muted);
    font-size: 7pt;
  }

  .dice {
    margin-right: 2.5mm;
    white-space: nowrap;
  }

  .attacks .name,
  .gear .name,
  .spell-table .name,
  .limited .name {
    font-weight: 700;
  }

  .attacks tr.empty td {
    height: 5mm;
  }

  .limited li,
  .slots li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2mm;
    padding: 0.6mm 0;
    border-bottom: 0.5pt solid var(--p-faint);
  }

  .slots li {
    justify-content: flex-start;
  }

  .slots .label {
    width: 14mm;
  }

  .pool .line {
    display: inline-block;
    min-width: 10mm;
    border-bottom: 0.75pt solid var(--p-ink);
    text-align: center;
  }

  .lines span {
    display: block;
    height: 6mm;
    border-bottom: 0.5pt solid var(--p-line);
  }

  /* Long texts flow in two columns. */
  .flow {
    columns: 2;
    column-gap: 6mm;
  }

  .flow :global(h3) {
    margin: 2mm 0 0.5mm;
    font-size: 9.5pt;
    break-after: avoid;
  }

  .flow :global(p) {
    margin: 0 0 1mm;
  }

  .flow :global(.name) {
    color: var(--p-accent);
  }

  .flow :global(.usage) {
    padding: 0 0.8mm;
    border: 0.5pt solid var(--p-line);
    border-radius: 1mm;
    font-size: 7.5pt;
  }

  .flow :global(.source) {
    color: var(--p-muted);
    font-size: 7.5pt;
  }

  .block {
    break-inside: auto;
  }

  .spell-table {
    margin-bottom: 2mm;
  }

  .spell-table .mark {
    width: 4mm;
    /* ★ and a circle side by side for a species' once-a-day spell. */
    white-space: nowrap;
    text-align: center;
  }

  /* A spell level moves to the next page whole when it fits there, so its heading never ends a page. */
  .spell-table tbody {
    break-inside: avoid;
  }

  .spell-table .level-row th {
    padding-top: 1.5mm;
    color: var(--p-accent);
    font-weight: 800;
  }

  .spell-table td {
    font-size: 7.5pt;
  }

  .spell-table td.name {
    font-size: 8.5pt;
  }

  .spell-table .note {
    display: block;
  }

  .always {
    color: var(--p-accent);
  }

  .legend {
    color: var(--p-muted);
    font-size: 7pt;
  }

  .coins {
    display: flex;
    gap: 1.5mm;
  }

  .coins div {
    flex: 1;
    min-height: 9mm;
    padding: 1mm 1.5mm;
    border: 0.75pt solid var(--p-line);
    border-radius: 1.5mm;
  }

  .coins .wide {
    flex: 2;
  }

  .coins dd {
    font-size: 11pt;
    font-weight: 800;
  }

  .magic li {
    padding: 0.5mm 0;
    border-bottom: 0.5pt solid var(--p-faint);
  }

  .gear {
    columns: 1;
  }

  .profile-top {
    display: flex;
    gap: 4mm;
    align-items: flex-start;
  }

  .portrait-large {
    width: 45mm;
    border-radius: 2mm;
  }

  .facts {
    flex: 1;
  }

  .pairs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 5mm;
  }

  .symbol {
    float: right;
    width: 25mm;
    margin: 0 0 2mm 4mm;
  }
</style>
