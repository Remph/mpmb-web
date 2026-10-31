import { describe, expect, it } from 'vitest';
import { menuItems } from './host.ts';

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

  it("hides a gear row's column moves, which only arrange the printed sheet", () => {
    // MakeInventoryLineMenu: Move up/down, a separator, the column move, a separator, Delete.
    const raw = [
      { cName: 'Move up', cReturn: 'Adventuring #3#up' },
      { cName: '-', cReturn: '-' },
      { cName: 'Move to right column', cReturn: 'Adventuring #3#movecol#ronly' },
      { cName: '-' },
      { cName: 'Delete line', cReturn: 'Adventuring #3#delete' },
    ];
    expect(menuItems(raw).map((item) => item.cName)).toEqual(['Move up', '-', 'Delete line']);
  });

  it('drops separators at the start and the end', () => {
    expect(menuItems([{ cName: '-' }, { cName: 'A' }, { cName: '-' }]).map((item) => item.cName)).toEqual(['A']);
  });

  it('takes a single submenu object as a list of one', () => {
    expect(menuItems([{ cName: 'A', oSubMenu: { cName: 'B' } }])).toEqual([{ cName: 'A', oSubMenu: [{ cName: 'B' }] }]);
  });
});
