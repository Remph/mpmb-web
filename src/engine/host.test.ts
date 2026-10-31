import { describe, expect, it } from 'vitest';
import { copyMenu, menuItems } from './host.ts';

describe('pop-up menus', () => {
  it('skips the holes MPMB leaves when it deletes empty groups', () => {
    // What MakeSourceMenu_SourceOptions sends after `delete SourceMenu[entry]` and the JSON copy.
    const raw = [
      { cName: 'All', oSubMenu: [{ cName: 'SRD', cReturn: 'sourcelist#SRD' }, null] },
      null,
      { cName: '-' },
      { cName: 'Open a dialog with a list of the sources', cReturn: 'sourcelist#dialogue' },
    ];
    expect(menuItems(raw)).toEqual([
      { cName: 'All', oSubMenu: [{ cName: 'SRD', cReturn: 'sourcelist#SRD' }] },
      { cName: '-' },
      { cName: 'Open a dialog with a list of the sources', cReturn: 'sourcelist#dialogue' },
    ]);
  });

  it('takes a single submenu object as a list of one', () => {
    expect(menuItems([{ cName: 'A', oSubMenu: { cName: 'B' } }])).toEqual([{ cName: 'A', oSubMenu: [{ cName: 'B' }] }]);
  });
});

describe('copying a menu out of the scripts', () => {
  it('keeps an item that MPMB built as an array with properties', () => {
    // The spell menu's menuLVL2: `var temp = []; temp.cName = …; temp.oSubMenu = [];`
    const complete = Object.assign([], {
      cName: "Make a 'Complete' Spell Sheet",
      oSubMenu: [{ cName: 'Paladin', cReturn: 'ssheet#complete#paladin#false', bMarked: false }],
    });
    // A deleted entry leaves a hole in the list.
    const raw = [{ cName: 'Generate a Spell Sheet', cReturn: 'ssheet#generate', bEnabled: true }, complete];
    raw.length = 3;
    expect(copyMenu(raw)).toEqual([
      { cName: 'Generate a Spell Sheet', cReturn: 'ssheet#generate', bEnabled: true },
      {
        cName: "Make a 'Complete' Spell Sheet",
        oSubMenu: [{ cName: 'Paladin', cReturn: 'ssheet#complete#paladin#false', bMarked: false }],
      },
      null,
    ]);
    expect(menuItems(copyMenu(raw)).map((item) => item.cName)).toEqual([
      'Generate a Spell Sheet',
      "Make a 'Complete' Spell Sheet",
    ]);
  });

  it('reads a name given as a list as text, as Acrobat does', () => {
    // The starting-equipment menu writes its separator as `cName: ["-"]`.
    expect(copyMenu([{ cName: ['-'] }])).toEqual([{ cName: '-' }]);
  });
});
