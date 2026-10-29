// M1 spike (throwaway): SpiderMonkey's `toSource()`, which only Acrobat's JavaScript engine has.
// The sheet stores objects as `toSource()` strings in form fields (the "Stringified" fields) and
// compares them, so the format has to be stable; it is also what Acrobat wrote into the
// reference PDFs: `({a:1, 'b c':"x", d:[1, 2]})`. Evaluated inside the realm that runs the
// scripts (worker global scope or vm context), not imported, so the prototypes are theirs.
export const PRELUDE = String.raw`
(function () {
  var esc = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f", "\v": "\\v", "\\": "\\\\" };
  function str(s, q) {
    var out = s.replace(/[\\\n\r\t\b\f\v"']|[^\x20-\x7e]/g, function (c) {
      if (esc[c]) return esc[c];
      if (c === q) return "\\" + c;
      if (c === '"' || c === "'") return c;
      var h = c.charCodeAt(0).toString(16).toUpperCase();
      return h.length <= 2 ? "\\x" + ("00" + h).slice(-2) : "\\u" + ("0000" + h).slice(-4);
    });
    return q + out + q;
  }
  var ident = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  function src(v, seen) {
    if (v === null) return "null";
    switch (typeof v) {
      case "string": return str(v, '"');
      case "number": return (v === 0 && 1 / v < 0) ? "-0" : String(v);
      case "boolean": case "undefined": return String(v);
      case "function": return "(" + Function.prototype.toString.call(v) + ")";
    }
    if (seen.indexOf(v) !== -1) return "#" + seen.indexOf(v) + "#";
    seen = seen.concat([v]);
    if (v instanceof Date) return "(new Date(" + v.getTime() + "))";
    if (v instanceof RegExp) return String(v);
    if (Array.isArray(v)) {
      var parts = [];
      for (var i = 0; i < v.length; i++) parts.push(i in v ? src(v[i], seen) : "");
      return "[" + parts.join(", ") + "]";
    }
    var keys = Object.keys(v), out = [];
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      out.push((ident.test(key) ? key : str(key, "'")) + ":" + src(v[key], seen));
    }
    return "{" + out.join(", ") + "}";
  }
  function define(proto, fn) {
    Object.defineProperty(proto, "toSource", { value: fn, enumerable: false, writable: true, configurable: true });
  }
  // Objects get the wrapping parentheses SpiderMonkey adds at the top level only
  define(Object.prototype, function () {
    var s = src(this, []);
    return s.charAt(0) === "{" ? "(" + s + ")" : s;
  });
  define(Array.prototype, function () { return src(this, []); });
  define(Function.prototype, function () { return src(this, []); });
  define(Date.prototype, function () { return src(this, []); });
  define(RegExp.prototype, function () { return src(this, []); });
  define(String.prototype, function () { return str(String(this), '"'); });
  define(Number.prototype, function () { return "(new Number(" + Number(this) + "))"; });
  define(Boolean.prototype, function () { return "(new Boolean(" + Boolean(this) + "))"; });
})();
`;
