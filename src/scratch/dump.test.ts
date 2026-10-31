import fs from 'node:fs';
import { it } from 'vitest';
import { openSheet, referenceSheet } from '../../test/characters.ts';
import type { DialogView, Host } from '../engine/host.ts';
import { ScriptedHost } from '../../test/hosts.ts';

it('dump', () => {
  const views: Record<string, unknown> = {};
  const base = new ScriptedHost();
  const host: Host = {
    alert: (r) => base.alert(r),
    popUpMenu: (items) => base.popUpMenu(items),
    dialog: (view: DialogView, first: boolean) => {
      if (first) views[String(view.description.name)] = view.description;
      return { type: 'close', result: 'cancel', state: view.state };
    },
  };
  const engine = openSheet(referenceSheet('paladin8-warlock2'), host);
  const strip = (e: unknown): unknown => JSON.parse(JSON.stringify(e));
  // find bookmark names
  const names = (n: { name: string; children?: unknown[] }, d = 0): string[] => [
    `${' '.repeat(d)}${n.name}`,
    ...((n.children ?? []) as { name: string }[]).flatMap((c) => names(c as never, d + 1)),
  ];
  fs.writeFileSync(
    '/tmp/claude-0/-home-user/93057d19-2573-53df-a53a-4143586873e6/scratchpad/fr2/bookmarks.txt',
    names((engine as unknown as { root: never }).root).join('\n'),
  );
  for (const path of [
    ['Functions', 'Source Material'],
    ['Functions', 'Class Selection'],
  ]) {
    try {
      engine.clickBookmark(path);
    } catch (e) {
      console.log(String(e));
    }
  }
  fs.writeFileSync(
    '/tmp/claude-0/-home-user/93057d19-2573-53df-a53a-4143586873e6/scratchpad/fr2/dialogs.json',
    JSON.stringify(strip(views), null, 1),
  );
});
