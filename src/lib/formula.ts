/**
 * فرمول‌سنج امن شاخص‌ها — فاز ۷۳
 *
 * یک پارسر بازگشتی-نزولی کوچک برای فرمول‌های شاخص؛ به‌جای eval (امنیت).
 *
 * پشتیبانی:
 *   - ارجاع ستون:  [نام ستون]  یا  [amount]
 *   - عملگرها:  + - * / % ^  و مقایسه  = != < <= > >=  و  AND OR NOT
 *   - توابع سطح ردیف:  IF(c,a,b) ABS(x) ROUND(x,d) MIN(...) MAX(...) POWER(a,b) SQRT(x) ISNUMBER(x)
 *   - توابع تجمیعی (فقط برای شاخص کل AGG):  SUM(col) AVG(col) COUNT(col) MIN(col) MAX(col) MEDIAN(col) STD(col)
 *   - اعداد فارسی/عربی خودکار به انگلیسی تبدیل می‌شوند
 *
 * مثال‌ها:
 *   [درآمد] - [هزینه]
 *   IF([درآمد] > 100000000, 1, 0)
 *   SUM([مبلغ]) / COUNT([مبلغ])          (شاخص کل)
 */

export type Val = number | string | boolean | null;

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "col"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

// ---------- نرمال‌سازی ارقام ----------
export function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function tokenize(src: string): Tok[] {
  const s = toEnDigits(src);
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) throw new Error("براکت بستهٔ ] برای نام ستون پیدا نشد");
      const name = s.slice(i + 1, end).trim();
      if (!name) throw new Error("نام ستون خالی است");
      toks.push({ t: "col", v: name });
      i = end + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = s.indexOf(c, i + 1);
      if (end < 0) throw new Error("کوتیشن بسته پیدا نشد");
      toks.push({ t: "str", v: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const n = parseFloat(s.slice(i, j));
      if (Number.isNaN(n)) throw new Error(`عدد نامعتبر: ${s.slice(i, j)}`);
      toks.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_\u0600-\u06FF]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9_\u0600-\u06FF]/.test(s[j])) j++;
      toks.push({ t: "id", v: s.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (["<=", ">=", "!=", "<>"].includes(two)) {
      toks.push({ t: "op", v: two === "<>" ? "!=" : two });
      i += 2;
      continue;
    }
    if ("+-*/%^(),=<>".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`نویسهٔ ناشناخته در فرمول: «${c}»`);
  }
  return toks;
}

// ---------- AST ----------
export type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "col"; v: string }
  | { k: "call"; name: string; args: Node[] }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "un"; op: string; a: Node };

function parse(tokens: Tok[]): Node {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v: string) => {
    const tk = tokens[p];
    if (tk && tk.t === "op" && tk.v === v) { p++; return true; }
    return false;
  };

  function expr(): Node { return orExpr(); }

  function orExpr(): Node {
    let a = andExpr();
    while (peek()?.t === "id" && (peek() as { v: string }).v === "OR") {
      p++;
      a = { k: "bin", op: "OR", a, b: andExpr() };
    }
    return a;
  }
  function andExpr(): Node {
    let a = notExpr();
    while (peek()?.t === "id" && (peek() as { v: string }).v === "AND") {
      p++;
      a = { k: "bin", op: "AND", a, b: notExpr() };
    }
    return a;
  }
  function notExpr(): Node {
    if (peek()?.t === "id" && (peek() as { v: string }).v === "NOT") {
      p++;
      return { k: "un", op: "NOT", a: notExpr() };
    }
    return cmpExpr();
  }
  function cmpExpr(): Node {
    let a = addExpr();
    while (peek()?.t === "op" && ["=", "!=", "<", "<=", ">", ">="].includes((peek() as { v: string }).v)) {
      const op = (tokens[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: addExpr() };
    }
    return a;
  }
  function addExpr(): Node {
    let a = mulExpr();
    while (peek()?.t === "op" && ((peek() as { v: string }).v === "+" || (peek() as { v: string }).v === "-")) {
      const op = (tokens[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: mulExpr() };
    }
    return a;
  }
  function mulExpr(): Node {
    let a = powExpr();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as { v: string }).v)) {
      const op = (tokens[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: powExpr() };
    }
    return a;
  }
  function powExpr(): Node {
    let a = unary();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "^") {
      p++;
      a = { k: "bin", op: "^", a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (peek()?.t === "op" && (peek() as { v: string }).v === "-") {
      p++;
      return { k: "un", op: "-", a: unary() };
    }
    return primary();
  }
  function primary(): Node {
    const tk = tokens[p];
    if (!tk) throw new Error("فرمول ناقص است");
    if (tk.t === "num") { p++; return { k: "num", v: tk.v }; }
    if (tk.t === "str") { p++; return { k: "str", v: tk.v }; }
    if (tk.t === "col") { p++; return { k: "col", v: tk.v }; }
    if (tk.t === "id") {
      p++;
      const name = tk.v;
      if (peek()?.t === "op" && (peek() as { v: string }).v === "(") {
        p++;
        const args: Node[] = [];
        if (!(peek()?.t === "op" && (peek() as { v: string }).v === ")")) {
          args.push(expr());
          while (eat(",")) args.push(expr());
        }
        if (!eat(")")) throw new Error(`پرانتز بستهٔ تابع ${name} پیدا نشد`);
        return { k: "call", name, args };
      }
      // کلیدواژهٔ تنها — خطا
      throw new Error(`عبارت ناشناخته: ${name}`);
    }
    if (tk.t === "op" && tk.v === "(") {
      p++;
      const e = expr();
      if (!eat(")")) throw new Error("پرانتز بسته پیدا نشد");
      return e;
    }
    throw new Error(`نویسهٔ غیرمنتظره: «${tk.t === "op" ? tk.v : "?"}»`);
  }

  const out = expr();
  if (p < tokens.length) throw new Error("بخشی از فرمول قابل تفسیر نبود — عبارت اضافه دارید");
  return out;
}

/** پارس فرمول — در صورت خطا Error با پیام فارسی می‌دهد */
export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  if (!toks.length) throw new Error("فرمول خالی است");
  return parse(toks);
}

// ---------- ارزیابی ----------
const F = (v: Val): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = parseFloat(toEnDigits(String(v)).replace(/[,،\s]/g, ""));
  return Number.isNaN(n) ? null : n;
};

function callFn(name: string, args: Val[]): Val {
  switch (name) {
    case "IF": return truthy(args[0]) ? args[1] ?? null : args[2] ?? null;
    case "ABS": { const x = F(args[0]); return x === null ? null : Math.abs(x); }
    case "ROUND": {
      const x = F(args[0]);
      if (x === null) return null;
      const d = args[1] === undefined ? 0 : F(args[1]) ?? 0;
      return Math.round(x * 10 ** d) / 10 ** d;
    }
    case "MIN": { const xs = args.map(F).filter((x): x is number => x !== null); return xs.length ? Math.min(...xs) : null; }
    case "MAX": { const xs = args.map(F).filter((x): x is number => x !== null); return xs.length ? Math.max(...xs) : null; }
    case "POWER": { const a = F(args[0]), b = F(args[1]); return a === null || b === null ? null : a ** b; }
    case "SQRT": { const x = F(args[0]); return x === null || x < 0 ? null : Math.sqrt(x); }
    case "ISNUMBER": return F(args[0]) !== null;
    default: throw new Error(`تابع «${name}» پشتیبانی نمی‌شود`);
  }
}

function truthy(v: Val): boolean {
  if (v === null || v === undefined || v === "") return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim();
  if (s === "TRUE" || s === "درست" || s === "بله") return true;
  if (s === "FALSE" || s === "نادرست" || s === "خیر" || s === "") return false;
  const n = parseFloat(s);
  return !(Number.isNaN(n) && s.length === 0) ? (Number.isNaN(n) ? true : n !== 0) : true;
}

/** ارزیابی در سطح یک ردیف — مقدار ستون‌ها از getCol خوانده می‌شود */
export function evalRow(node: Node, getCol: (name: string) => Val): Val {
  switch (node.k) {
    case "num": return node.v;
    case "str": return node.v;
    case "col": return getCol(node.v);
    case "un": {
      if (node.op === "-") { const x = F(evalRow(node.a, getCol)); return x === null ? null : -x; }
      return !truthy(evalRow(node.a, getCol));
    }
    case "bin": {
      const op = node.op;
      if (op === "AND") return truthy(evalRow(node.a, getCol)) && truthy(evalRow(node.b, getCol));
      if (op === "OR") return truthy(evalRow(node.a, getCol)) || truthy(evalRow(node.b, getCol));
      if (["=", "!=", "<", "<=", ">", ">="].includes(op)) {
        const a = evalRow(node.a, getCol), b = evalRow(node.b, getCol);
        const fa = F(a), fb = F(b);
        if (fa !== null && fb !== null) {
          switch (op) {
            case "=": return fa === fb;
            case "!=": return fa !== fb;
            case "<": return fa < fb;
            case "<=": return fa <= fb;
            case ">": return fa > fb;
            case ">=": return fa >= fb;
          }
        }
        const sa = String(a ?? ""), sb = String(b ?? "");
        switch (op) {
          case "=": return sa === sb;
          case "!=": return sa !== sb;
          case "<": return sa < sb;
          case "<=": return sa <= sb;
          case ">": return sa > sb;
          case ">=": return sa >= sb;
        }
      }
      const a = F(evalRow(node.a, getCol)), b = F(evalRow(node.b, getCol));
      if (a === null || b === null) return null;
      switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return b === 0 ? null : a / b;
        case "%": return b === 0 ? null : a % b;
        case "^": return a ** b;
      }
      throw new Error(`عملگر ناشناخته: ${op}`);
    }
    case "call":
      return callFn(node.name, node.args.map((a) => evalRow(a, getCol)));
  }
}

/** ارزیابی تجمیعی روی همهٔ ردیف‌ها — SUM/AVG/COUNT/MIN/MAX/MEDIAN/STD */
export function evalAgg(node: Node, rows: Array<Record<string, unknown>>): Val {
  const AGG_FNS = new Set(["SUM", "AVG", "COUNT", "MIN", "MAX", "MEDIAN", "STD"]);
  switch (node.k) {
    case "call": {
      if (!AGG_FNS.has(node.name)) {
        // توابع سطح ردیف روی نتیجهٔ تجمیعی آرگومان‌ها
        return callFn(node.name, node.args.map((a) => evalAgg(a, rows)));
      }
      const arg = node.args[0];
      if (!arg) throw new Error(`تابع ${node.name} به یک ستون نیاز دارد`);
      if (node.name === "COUNT") {
        // COUNT بدون ستون = تعداد ردیف‌ها؛ COUNT(col) = تعداد مقدار غیر خالی
        if (arg.k === "num") return rows.length;
        let n = 0;
        for (const r of rows) {
          const v = evalRow(arg, (c) => (c in r ? (r[c] as Val) : null));
          if (v !== null && v !== undefined && v !== "") n++;
        }
        return n;
      }
      const xs: number[] = [];
      for (const r of rows) {
        const v = F(evalRow(arg, (c) => (c in r ? (r[c] as Val) : null)));
        if (v !== null) xs.push(v);
      }
      if (!xs.length) return null;
      switch (node.name) {
        case "SUM": return xs.reduce((a, b) => a + b, 0);
        case "AVG": return xs.reduce((a, b) => a + b, 0) / xs.length;
        case "MIN": return Math.min(...xs);
        case "MAX": return Math.max(...xs);
        case "MEDIAN": {
          const s = [...xs].sort((a, b) => a - b);
          const mid = Math.floor(s.length / 2);
          return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        }
        case "STD": {
          const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
          return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
        }
      }
      return null;
    }
    case "bin": {
      const op = node.op;
      if (op === "AND") return truthy(evalAgg(node.a, rows)) && truthy(evalAgg(node.b, rows));
      if (op === "OR") return truthy(evalAgg(node.a, rows)) || truthy(evalAgg(node.b, rows));
      if (["=", "!=", "<", "<=", ">", ">=", "+", "-", "*", "/", "%", "^"].includes(op)) {
        const a = evalAgg(node.a, rows), b = evalAgg(node.b, rows);
        const fa = F(a), fb = F(b);
        if (fa !== null && fb !== null) {
          switch (op) {
            case "=": return fa === fb;
            case "!=": return fa !== fb;
            case "<": return fa < fb;
            case "<=": return fa <= fb;
            case ">": return fa > fb;
            case ">=": return fa >= fb;
            case "+": return fa + fb;
            case "-": return fa - fb;
            case "*": return fa * fb;
            case "/": return fb === 0 ? null : fa / fb;
            case "%": return fb === 0 ? null : fa % fb;
            case "^": return fa ** fb;
          }
        }
        return null;
      }
      return null;
    }
    case "un": {
      if (node.op === "-") { const x = F(evalAgg(node.a, rows)); return x === null ? null : -x; }
      return !truthy(evalAgg(node.a, rows));
    }
    case "num": return node.v;
    case "str": return node.v;
    case "col": throw new Error("در شاخص کل باید از توابع تجمیعی مثل SUM([ستون]) استفاده شود");
  }
}

/** فهرست ستون‌های استفاده‌شده در فرمول — برای اعتبارسنجی */
export function formulaColumns(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.k === "col") out.push(n.v);
    else if (n.k === "bin") { walk(n.a); walk(n.b); }
    else if (n.k === "un") walk(n.a);
    else if (n.k === "call") n.args.forEach(walk);
  };
  walk(node);
  return [...new Set(out)];
}
