// Persian RTL cover — Recipe R1 (Pure Paragraph) mirrored for RTL
// Structure follows design-system.md buildCoverR1 exactly: single 16838 wrapper,
// allNoBorders, dynamic calcTitleLayout + calcCoverSpacing — mirrored for Persian.
const {
  Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType,
  WidthType, BorderStyle, ShadingType, TableLayoutType,
} = require("docx");
const { allNoBorders, noBorders, tr, en } = require("./gen-doc-helpers");

/** Word-based line splitting for Persian (spaces are semantic boundaries) */
function splitTitleLinesFa(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const words = title.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cand.length <= charsPerLine || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  // merge tiny orphan into previous line
  if (lines.length > 1 && lines[lines.length - 1].length <= 4) {
    const last = lines.pop();
    lines[lines.length - 1] += " " + last;
  }
  return lines;
}

/** Persian title layout — Persian chars ≈ pt×11.5 twips wide (narrower than CJK) */
function calcTitleLayoutFa(title, maxWidthTwips, preferredPt = 36, minPt = 24) {
  const charWidth = (pt) => pt * 11.5;
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = Math.floor(maxWidthTwips / charWidth(titlePt));
    if (cpl < 4) { titlePt -= 2; continue; }
    lines = splitTitleLinesFa(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLinesFa(title, Math.floor(maxWidthTwips / charWidth(minPt)));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

/** From design-system.md calcCoverSpacing (unchanged logic) */
function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
    marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight +
                        metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

/**
 * R1 mirrored for RTL: full-page background + right-aligned Persian text.
 * config: { title, subtitle, englishLabel, metaLines, footerInner, footerOuter, palette }
 */
function buildCoverR1Fa(config) {
  const CP = config.palette; // { bg, titleColor, subtitleColor, metaColor, accent, footerColor }
  const padL = 800, padR = 1200; // mirrored: main padding on the RIGHT

  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayoutFa(config.title, availableWidth, 36, 24);
  const titleSize = titlePt * 2;

  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });

  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: CP.accent, space: 12 };
  const children = [];

  // 1. Dynamic top whitespace
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  // 2. English label with accent bottom border (right-aligned, mirrored)
  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { left: padL, right: padR },
      spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: CP.accent, space: 8 } },
      children: [new TextRun({
        text: config.englishLabel.split("").join("  "),
        size: 18, color: CP.accent, font: { ascii: "Calibri", hAnsi: "Calibri" }, characterSpacing: 40,
      })],
    }));
  }

  // 3. Main title (dynamic size + word-safe breaks, large-font line rule 8)
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { right: padR, left: padL },
      spacing: {
        after: i < titleLines.length - 1 ? 100 : 300,
        line: Math.ceil(titlePt * 23), lineRule: "atLeast",
      },
      children: [tr(titleLines[i], { bold: true, size: titleSize, color: CP.titleColor })],
    }));
  }

  // 4. Subtitle
  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { right: padR, left: padL },
      spacing: { after: 800, line: 312 },
      children: [tr(config.subtitle, { size: 24, color: CP.subtitleColor })],
    }));
  }

  // 5. Meta lines with accent border (mirrored: border on the right)
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.START,
      indent: { right: padR + 200, left: padL },
      spacing: { after: 80, line: 312 },
      border: { right: accentRight },
      children: [tr(line, { size: 24, color: CP.metaColor })],
    }));
  }

  // 6. Dynamic bottom whitespace
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  // 7. Footer with top accent separator (bidi: first run = rightmost)
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.START,
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: CP.accent, space: 8 } },
    spacing: { before: 200, line: 312 },
    children: [
      tr(config.footerInner || "", { size: 16, color: CP.footerColor }),
      new TextRun({ text: "                                        ", font: { ascii: "Tahoma" } }),
      en(config.footerOuter || "", { size: 16, color: CP.footerColor }),
    ],
  }));

  // Single 16838 wrapper — the ONLY table (allNoBorders mandatory)
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: CP.bg },
        borders: noBorders,
        children,
      })],
    })],
  })];
}

module.exports = { buildCoverR1Fa, calcTitleLayoutFa, splitTitleLinesFa, calcCoverSpacing };
