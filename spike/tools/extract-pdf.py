# M1 spike (throwaway). Reads a Colorful A4 PDF and writes JSON the stand-in can use:
#   fields:   every terminal form field with type, flags, default/current value, choices, scripts
#   calcOrder: the /CO list as field names
#   docJs:    the 27 document-level scripts (only with --docjs)
# Run: python3 -I extract-pdf.py <pdf> <out.json> [--docjs]
# Needs pypdf. Output is derived from the PDF and is git-ignored (spike/data/).
import json
import sys

from pypdf import PdfReader
from pypdf.generic import IndirectObject, NameObject


def res(o):
    return o.get_object() if isinstance(o, IndirectObject) else o


def text(o):
    o = res(o)
    if o is None:
        return None
    if hasattr(o, "get_data"):
        b = o.get_data()
        # Script streams are UTF-16 (with a BOM) in some PDFs and plain bytes in others.
        if b[:2] == b"\xfe\xff":
            return b[2:].decode("utf-16-be")
        if b[:2] == b"\xff\xfe":
            return b[2:].decode("utf-16-le")
        try:
            return b.decode("utf-8")
        except UnicodeDecodeError:
            return b.decode("latin-1")
    return str(o)


def js_of(action):
    action = res(action)
    if not action:
        return None
    return text(action.get("/JS"))


def unslash(v):
    return v[1:] if isinstance(v, str) and v.startswith("/") else v


def checkbox_states(f, kids):
    """Names of the 'on' appearance states (anything but Off)."""
    states = []
    for w in kids or [f]:
        w = res(w)
        ap = res(w.get("/AP"))
        if not ap:
            continue
        n = res(ap.get("/N"))
        if n:
            states += [str(k)[1:] for k in n.keys() if str(k) != "/Off"]
    return sorted(set(states))


def templates_of(root):
    """Template name -> names of the fields on its page (spawning copies them, renamed)."""
    out = {}
    names = res(root.get("/Names")) or {}
    tpl = res(names.get("/Templates"))
    if not tpl:
        return out
    arr = tpl["/Names"]
    for i in range(0, len(arr), 2):
        page = res(arr[i + 1])
        fields = []
        for a in res(page.get("/Annots")) or []:
            a = res(a)
            if str(a.get("/Subtype")) != "/Widget":
                continue
            parts, x = [], a
            while x is not None:
                if "/T" in x:
                    parts.append(str(x["/T"]))
                x = res(x.get("/Parent"))
            n = ".".join(reversed(parts))
            if n and n not in fields:
                fields.append(n)
        out[str(arr[i])] = fields
    return out


def widget_pages(r):
    """Widget object id -> (page index, rect) for the real pages."""
    pos = {}
    for pi, page in enumerate(r.pages):
        for a in page.get("/Annots") or []:
            if isinstance(a, IndirectObject):
                rect = [round(float(x), 2) for x in res(a).get("/Rect", [])]
                pos[a.idnum] = (pi, rect)
    return pos


def outline_of(r):
    """The bookmark tree as [{name, children}] (MPMB keeps references to its sheet bookmarks)."""

    def conv(items):
        out, last = [], None
        for it in items:
            if isinstance(it, list):
                if last is not None:
                    last["children"] = conv(it)
            else:
                last = {"name": str(it.title), "children": []}
                out.append(last)
        return out

    try:
        return conv(r.outline)
    except Exception:
        return []


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    want_docjs = "--docjs" in sys.argv
    r = PdfReader(pdf)
    root = r.trailer["/Root"]
    acro = res(root["/AcroForm"])

    fields = {}
    id_to_name = {}
    pos = widget_pages(r)

    def walk(f_ref, parent="", inherited=None):
        f = res(f_ref)
        inherited = dict(inherited or {})
        for k in ("/FT", "/Ff", "/DA", "/Q", "/MaxLen", "/Opt", "/V", "/DV"):
            if k in f:
                inherited[k] = f[k]
        t = f.get("/T")
        name = parent + ("." if parent and t else "") + (str(t) if t else "")
        kids = f.get("/Kids")
        if kids and any("/T" in res(k) for k in kids):
            for k in kids:
                walk(k, name, inherited)
            return
        ft = str(inherited.get("/FT")) if inherited.get("/FT") else None
        ff = int(inherited.get("/Ff", 0))
        acts = {}
        # Actions can sit on the field or on its widgets (kids without /T).
        for holder in [f] + [res(k) for k in (kids or [])]:
            aa = res(holder.get("/AA")) or {}
            for key in aa.keys():
                s = js_of(aa[key])
                if s is not None:
                    acts[str(key)[1:]] = s
            if holder.get("/A"):
                s = js_of(holder["/A"])
                if s is not None:
                    acts["A"] = s
        info = {"type": ft[1:] if ft else None, "ff": ff, "acts": acts}
        if ft == "/Btn":
            info["on"] = checkbox_states(f, kids)
            info["btn"] = "push" if ff & (1 << 16) else "radio" if ff & (1 << 15) else "check"
        if ft == "/Ch":
            opts = []
            for o in res(inherited.get("/Opt")) or []:
                o = res(o)
                if isinstance(o, list):
                    opts.append([str(res(o[0])), str(res(o[1]))])
                else:
                    opts.append(str(o))
            info["opt"] = opts
        if "/MaxLen" in inherited:
            info["maxLen"] = int(inherited["/MaxLen"])
        for key, jkey in (("/V", "v"), ("/DV", "dv")):
            if key in inherited:
                v = res(inherited[key])
                if isinstance(v, list):
                    info[jkey] = [str(res(x)) for x in v]
                else:
                    info[jkey] = text(v)
        if ft == "/Btn":
            for jkey in ("v", "dv"):
                if jkey in info:
                    info[jkey] = unslash(info[jkey])
        rv = text(f.get("/RV")) if f.get("/RV") else None
        if rv:
            info["rv"] = rv
        tu = text(f.get("/TU")) if f.get("/TU") else None
        if tu:
            info["tu"] = tu
        # /TM is Acrobat's "submitName"; MPMB stores toSource() strings and keys in it.
        tm = text(f.get("/TM")) if f.get("/TM") else None
        if tm:
            info["tm"] = tm
        info["widgets"] = len(kids) if kids else 1
        # Widget annotation flags /F -> Acrobat's `display` (0 visible, 1 hidden, 2 noPrint, 3 noView).
        # MPMB reads `display` back as state (isDisplay), so it is part of a character.
        flags = [int(res(k).get("/F", 0)) for k in (kids or [f_ref])]
        fl = flags[0]
        info["disp"] = 1 if fl & 2 else 3 if fl & 32 else 2 if not fl & 4 else 0
        wl = [k for k in (kids or [f_ref]) if isinstance(k, IndirectObject)]
        info["pg"] = [pos[k.idnum][0] if k.idnum in pos else -1 for k in wl]
        info["rect"] = [pos[k.idnum][1] if k.idnum in pos else [] for k in wl]
        fields[name] = info
        if isinstance(f_ref, IndirectObject):
            id_to_name[f_ref.idnum] = name
        # /CO may point at a widget (a kid) instead of the field itself.
        for k in kids or []:
            if isinstance(k, IndirectObject):
                id_to_name.setdefault(k.idnum, name)

    for f in acro["/Fields"]:
        walk(f)

    print("raw /CO length", len(acro.get("/CO", [])))
    co = [id_to_name.get(o.idnum) for o in acro.get("/CO", []) if isinstance(o, IndirectObject)]
    data = {"fields": fields, "calcOrder": [n for n in co if n]}
    # Document info dictionary, including MPMB's custom entries (SheetVersion, SpellsOnly, ...).
    meta = r.metadata or {}
    data["info"] = {str(k)[1:]: str(v) for k, v in meta.items()}
    data["numPages"] = len(r.pages)
    data["templates"] = templates_of(root)
    data["outline"] = outline_of(r)

    if want_docjs:
        js = res(root["/Names"])["/JavaScript"]["/Names"]
        data["docJs"] = [
            {"name": str(js[i]), "code": js_of(js[i + 1])} for i in range(0, len(js), 2)
        ]
    json.dump(data, open(out, "w"), ensure_ascii=False)
    print(pdf, len(fields), "fields,", len(data["calcOrder"]), "in calc order")


main()
