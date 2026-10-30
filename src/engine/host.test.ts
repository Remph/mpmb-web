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

  it('takes a single submenu object as a list of one', () => {
    expect(menuItems([{ cName: 'A', oSubMenu: { cName: 'B' } }])).toEqual([{ cName: 'A', oSubMenu: [{ cName: 'B' }] }]);
  });
});
