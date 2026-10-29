// Acrobat's bookmark objects. MPMB's bookmarks are its main menu: each runs a script, and MPMB edits
// the tree (adds the pages it spawns, colours entries). The tree is plain data in the document
// (Bookmark); these objects wrap its nodes, one per node, so that scripts see stable objects.
import type { RealmTools } from './realm.ts';
import type { Bookmark } from './types.ts';

export interface BookmarkHost {
  tools: RealmTools;
  /** Runs a bookmark's script with `event.target` set to the bookmark. */
  runAction(node: BookmarkNode, script: string): void;
}

export class BookmarkNode {
  readonly data: Bookmark;
  readonly parent: BookmarkNode | null;
  private readonly host: BookmarkHost;
  private readonly kids = new WeakMap<Bookmark, BookmarkNode>();

  constructor(host: BookmarkHost, data: Bookmark, parent: BookmarkNode | null) {
    this.host = host;
    this.data = data;
    this.parent = parent;
  }

  private wrap(child: Bookmark): BookmarkNode {
    let node = this.kids.get(child);
    if (!node) {
      node = new BookmarkNode(this.host, child, this);
      this.kids.set(child, node);
    }
    return node;
  }

  get name(): string {
    return this.data.name;
  }
  set name(n: string) {
    this.data.name = String(n);
  }
  /** Acrobat gives null, not an empty array, for a bookmark without children; MPMB tests for it. */
  get children(): BookmarkNode[] | null {
    const list = this.data.children;
    return list.length ? this.host.tools.array(list.map((c) => this.wrap(c))) : null;
  }
  get open(): boolean {
    return this.data.open ?? false;
  }
  set open(o: boolean) {
    this.data.open = Boolean(o);
  }
  get style(): number {
    return this.data.style ?? 0;
  }
  set style(s: number) {
    this.data.style = Number(s);
  }
  get color(): unknown[] {
    return this.host.tools.copy(this.data.color ?? ['G', 0]);
  }
  set color(c: unknown[]) {
    this.data.color = JSON.parse(JSON.stringify(c ?? null)) as unknown[];
  }
  get doc(): unknown {
    return this.host.tools.realm.global;
  }

  createChild(cName: unknown, cExpr?: unknown, nIndex?: unknown): void {
    // MPMB passes one object ({cName, cExpr, nIndex}); Acrobat also takes the three arguments.
    const args =
      typeof cName === 'object' && cName !== null
        ? (cName as { cName?: unknown; cExpr?: unknown; nIndex?: unknown })
        : { cName, cExpr, nIndex };
    const child: Bookmark = { name: String(args.cName ?? ''), children: [] };
    if (args.cExpr !== undefined) child.action = String(args.cExpr);
    const list = this.data.children;
    const at = typeof args.nIndex === 'number' && args.nIndex >= 0 ? Math.min(args.nIndex, list.length) : list.length;
    this.data.children = [...list.slice(0, at), child, ...list.slice(at)];
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.data.children = this.parent.data.children.filter((c) => c !== this.data);
  }

  setAction(script: unknown): void {
    this.data.action = String(script ?? '');
  }

  execute(): void {
    if (this.data.action) this.host.runAction(this, this.data.action);
  }
}
