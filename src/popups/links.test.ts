import { describe, expect, test } from 'vitest';
import { linkKind } from './links.ts';

describe('linkKind', () => {
  test.each([
    'https://www.flapkan.com/how-to/add-more-content',
    'https://flapkan.com/faq',
    'http://www.flapkan.com/',
    'https://www.patreon.com/morepurplemorebetter',
    'https://github.com/morepurplemorebetter/',
    'https://github.com/MorePurpleMoreBetter/2024_MPMBs-Character-Record-Sheet',
  ])('MPMB opens at once: %s', (url) => expect(linkKind(url)).toBe('mpmb'));

  test.each([
    'https://www.dndbeyond.com/srd',
    'https://discord.gg/MY5wKpV',
    'https://github.com/someone-else/morepurplemorebetter',
    'https://www.patreon.com/morepurplemorebetter-fan',
    'https://flapkan.com.example.net/?data=1',
    'https://flapkan.com@example.net/',
    'https://notflapkan.com/',
  ])('anything else asks first: %s', (url) => expect(linkKind(url)).toBe('other'));

  test.each(['javascript:alert(1)', 'file:///c:/', 'data:text/html,hi', 'www.flapkan.com', ''])(
    'never opens: %s',
    (url) => expect(linkKind(url)).toBe('refused'),
  );
});
