// Helpers for Persian RTL Word document generation (docx-js)
// Follows docx skill: design-system.md R1 recipe (RTL-mirrored) + common-rules.md
const {
  Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType,
} = require("docx");

// ── Palette: MC-1 Medical Blue (clinic/healthcare) ──
const P = {
  bg: "F5F8FC", primary: "1A5276", accent: "2E86C1",
  cover: { titleColor: "1A5276", subtitleColor: "606060", metaColor: "707070", footerColor: "A0A0A0" },
  table: { headerBg: "2E86C1", headerText: "FFFFFF", accentLine: "1A5276", innerLine: "D0DDE8", surface: "EDF3F8" },
};

const FA_FONT = { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma", eastAsia: "Tahoma" };
const MONO_FONT = { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas", eastAsia: "Consolas" };

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };

// ── Run helpers ──
/** Persian (RTL) run */
function tr(text, o = {}) {
  return new TextRun({
    text: String(text ?? ""),
    rightToLeft: true,
    font: FA_FONT,
    size: o.size ?? 24,
    sizeComplexScript: o.size ?? 24,
    bold: !!o.bold,
    boldComplexScript: !!o.bold,
    italics: !!o.italics,
    color: o.color ?? "000000",
  });
}
/** Latin/mono (LTR) run — code, URLs, claim names */
function en(text, o = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: o.mono ? MONO_FONT : FA_FONT,
    size: o.size ?? 22,
    sizeComplexScript: o.size ?? 22,
    bold: !!o.bold,
    color: o.color ?? "000000",
  });
}

// ── Paragraph helpers ──
/** Persian body paragraph (justified, 1.3x spacing) */
function p(children, o = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: o.align ?? AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: o.after ?? 120, before: o.before ?? 0 },
    keepNext: !!o.keepNext,
    children: Array.isArray(children) ? children : [tr(children, o.run || {})],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    bidirectional: true,
    alignment: AlignmentType.START,
    keepNext: true,
    spacing: { before: 360, after: 160, line: 312 },
    children: [tr(text, { bold: true, size: 30, color: P.primary })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: true,
    alignment: AlignmentType.START,
    keepNext: true,
    spacing: { before: 240, after: 120, line: 312 },
    children: [tr(text, { bold: true, size: 26, color: P.primary })],
  });
}

/** RTL bullet item */
function bullet(children, o = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    bullet: { level: 0 },
    spacing: { line: 312, after: o.after ?? 60 },
    children: Array.isArray(children) ? children : [tr(children)],
  });
}

/** RTL numbered item (unique reference per list) */
function numbered(reference, children, o = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    numbering: { reference, level: 0 },
    spacing: { line: 312, after: o.after ?? 60 },
    children: Array.isArray(children) ? children : [tr(children)],
  });
}

// ── Persian table (RTL) ──
// headers: string[]; rows: (string | TextRun[])[][]; widths: percentage[]
function mkTable(headers, rows, widths, o = {}) {
  const border = (c, sz) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
  const cellPara = (content, isHeader) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      spacing: { line: 312, after: 0 },
      children: Array.isArray(content)
        ? content
        : [tr(content, isHeader
            ? { bold: true, size: 21, color: P.table.headerText }
            : { size: 21 })],
    });

  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border(P.table.accentLine, 6),
      bottom: border(P.table.accentLine, 6),
      left: NB, right: NB,
      insideHorizontal: border(P.table.innerLine, 2),
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((h, i) =>
          new TableCell({
            children: [cellPara(h, true)],
            shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: widths[i], type: WidthType.PERCENTAGE },
          })
        ),
      }),
      ...rows.map((r, ri) =>
        new TableRow({
          cantSplit: true,
          children: r.map((c, i) =>
            new TableCell({
              children: [cellPara(c, false)],
              shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined,
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              width: { size: widths[i], type: WidthType.PERCENTAGE },
            })
          ),
        })
      ),
    ],
  });
}

/** Table caption (keepNext) */
function tableCaption(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    keepNext: true,
    spacing: { before: 160, after: 80, line: 312 },
    children: [tr(text, { bold: true, size: 21, color: P.primary })],
  });
}

// ── Code box (LTR mono, shaded) ──
function codeBox(lines) {
  const border = (c, sz) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border(P.table.innerLine, 4), bottom: border(P.table.innerLine, 4),
      left: border(P.table.innerLine, 4), right: border(P.table.innerLine, 4),
      insideHorizontal: NB, insideVertical: NB,
    },
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "F4F7FA" },
        margins: { top: 140, bottom: 140, left: 220, right: 220 },
        width: { size: 100, type: WidthType.PERCENTAGE },
        children: lines.map((l) =>
          new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { line: 312, after: 0 },
            children: [en(l === "" ? " " : l, { mono: true, size: 17, color: "1B2A38" })],
          })
        ),
      })],
    })],
  });
}

/** Small spacer paragraph after tables/code boxes */
function gap(h = 120) {
  return new Paragraph({ spacing: { after: h, line: 240 }, children: [] });
}

module.exports = {
  P, FA_FONT, MONO_FONT, allNoBorders, noBorders,
  tr, en, p, h1, h2, bullet, numbered, mkTable, tableCaption, codeBox, gap,
};
