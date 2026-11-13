// Genera un .docx con formato APA 7 a partir de un Markdown del informe.
// Uso: node scripts/build-report-docx.mjs [entrada.md] [salida.docx]
// Por defecto: docs/INFORME_PRUEBAS_RADAR_v2.md -> docs/INFORME_PRUEBAS_RADAR_v2.docx
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageBreak, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, HeadingLevel,
} from 'docx';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docsDir = resolve(root, 'docs');
const input = resolve(root, process.argv[2] ?? 'docs/INFORME_PRUEBAS_RADAR_v2.md');
const output = resolve(root, process.argv[3] ?? 'docs/INFORME_PRUEBAS_RADAR_v2.docx');

const FONT = 'Times New Roman';
const MONO = 'Consolas';
const BODY = 24; // 12 pt (medios puntos)
const DOUBLE = 480; // interlineado doble
const INDENT = 720; // 0,5 in = 1,27 cm
const TEXT_WIDTH = 9360; // 6,5 in en twips
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const RULE = { style: BorderStyle.SINGLE, size: 8, color: '000000' };

const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// ---------------------------------------------------------------- texto en linea
function runs(tokens = [], fmt = {}) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'strong': out.push(...runs(t.tokens, { ...fmt, bold: true })); break;
      case 'em': out.push(...runs(t.tokens, { ...fmt, italics: true })); break;
      case 'codespan':
        out.push(new TextRun({ text: decode(t.text), font: MONO, size: Math.min(fmt.size ?? BODY, 20), bold: fmt.bold, italics: fmt.italics }));
        break;
      case 'link': out.push(...runs(t.tokens, fmt)); break;
      case 'br': out.push(new TextRun({ text: '', break: 1 })); break;
      case 'text':
        if (t.tokens?.length) out.push(...runs(t.tokens, fmt));
        else out.push(new TextRun({ text: decode(t.text), ...fmt }));
        break;
      case 'escape': case 'html': default:
        out.push(new TextRun({ text: decode((t.text ?? '').replace(/<[^>]+>/g, '')), ...fmt }));
    }
  }
  return out;
}

// HTML sencillo (portada / leyendas): <strong>, <em>, <code>, <br>
function htmlRuns(html, fmt = {}) {
  const out = [];
  const parts = html.split(/(<br\s*\/?>|<\/?strong>|<\/?em>|<\/?code>)/i);
  let f = { ...fmt };
  for (const p of parts) {
    if (!p) continue;
    const tag = p.toLowerCase();
    if (/^<br/.test(tag)) out.push(new TextRun({ text: '', break: 1 }));
    else if (tag === '<strong>') f = { ...f, bold: true };
    else if (tag === '</strong>') f = { ...f, bold: fmt.bold };
    else if (tag === '<em>') f = { ...f, italics: true };
    else if (tag === '</em>') f = { ...f, italics: fmt.italics };
    else if (tag === '<code>') f = { ...f, font: MONO, size: 20 };
    else if (tag === '</code>') f = { ...f, font: fmt.font, size: fmt.size };
    else out.push(new TextRun({ text: decode(p.replace(/<[^>]+>/g, '')), ...f }));
  }
  return out;
}

// ---------------------------------------------------------------- bloques
const body = (children, opts = {}) =>
  new Paragraph({ children, indent: { firstLine: INDENT }, spacing: { line: DOUBLE }, ...opts });
const plain = (children, opts = {}) => new Paragraph({ children, spacing: { line: DOUBLE }, ...opts });

function noteParagraph(children) {
  return new Paragraph({ children, spacing: { line: 360, before: 60, after: 240 } });
}

function codeBox(text) {
  const lines = decode(text).replace(/\n$/, '').split('\n');
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: [TEXT_WIDTH],
    borders: { top: RULE, bottom: RULE, left: RULE, right: RULE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: TEXT_WIDTH, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: lines.map((l) => new Paragraph({
          spacing: { line: 240 },
          children: [new TextRun({ text: l || ' ', font: MONO, size: 16 })],
        })),
      })],
    })],
  });
}

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function imageParagraph(src) {
  const data = readFileSync(resolve(docsDir, src));
  const { w, h } = pngSize(data);
  const maxW = 600, maxH = 360; // px a 96 ppp (6,25 x 3,75 in)
  const k = Math.min(maxW / w, maxH / h, 1);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: { line: 240, after: 60 },
    children: [new ImageRun({ type: 'png', data, transformation: { width: Math.round(w * k), height: Math.round(h * k) } })],
  });
}

function figure(html) {
  const num = html.match(/<figcaption><strong>(.*?)<\/strong>/)?.[1] ?? 'Figura';
  const title = html.match(/<br><em>(.*?)<\/em>/)?.[1] ?? '';
  const note = html.match(/<span class="nota">([\s\S]*?)<\/span>/)?.[1] ?? '';
  const out = [
    plain([new TextRun({ text: num, bold: true })], { keepNext: true, spacing: { line: DOUBLE, before: 240 } }),
    plain(htmlRuns(title, { italics: true }), { keepNext: true }),
  ];
  const img = html.match(/<img src="([^"]+)"/);
  const pre = html.match(/<pre class="evidencia">([\s\S]*?)<\/pre>/);
  if (img) out.push(imageParagraph(img[1]));
  if (pre) out.push(codeBox(pre[1]));
  if (note) out.push(noteParagraph(htmlRuns(note, { size: 20 })));
  return out;
}

function table(token) {
  const cols = token.header.length;
  // Ancho minimo por columna = palabra mas larga (no se parten palabras ni identificadores);
  // el ancho restante se reparte en proporcion a la longitud media del contenido.
  const cellsOf = (c) => [token.header[c], ...token.rows.map((r) => r[c] ?? { text: '' })];
  const longestWord = (c) => Math.max(...cellsOf(c).map((x, i) => Math.max(...x.text.replace(/[`*]/g, '')
    .split(/\s+/).map((w) => w.length * (i === 0 ? 105 : /`/.test(x.text) ? 100 : 92)))));
  const minW = Array.from({ length: cols }, (_, c) => Math.min(longestWord(c) + 170, 2600));
  const avgLen = Array.from({ length: cols }, (_, c) => {
    const lens = cellsOf(c).map((x) => x.text.length);
    return Math.max(lens.reduce((a, b) => a + b, 0) / lens.length, 1);
  });
  let widths = [...minW];
  const free = TEXT_WIDTH - widths.reduce((a, b) => a + b, 0);
  if (free > 0) {
    const tot = avgLen.reduce((a, b) => a + b, 0);
    widths = widths.map((w, c) => w + Math.round((avgLen[c] / tot) * free));
  } else {
    const tot = widths.reduce((a, b) => a + b, 0);
    widths = widths.map((w) => Math.round((w / tot) * TEXT_WIDTH));
  }
  const isId = (s) => /^(?:[A-Z0-9]{2,4}-)+[A-Z0-9]+[a-z]?$/.test(s.trim());

  const cell = (c, i, header) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    borders: header ? { top: NONE, left: NONE, right: NONE, bottom: RULE } : { top: NONE, left: NONE, right: NONE, bottom: NONE },
    children: [new Paragraph({
      alignment: header ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { line: 240 },
      children: runs(c.tokens, { size: 18, bold: header || undefined }).map((r) => r),
    })],
  });

  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: { top: RULE, bottom: RULE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: token.header.map((c, i) => cell(c, i, true)) }),
      ...token.rows.map((r) => new TableRow({
        cantSplit: true,
        children: r.map((c, i) => (isId(c.text) && widths[i] < 1300 ? cell(c, i, false) : cell(c, i, false))),
      })),
    ],
  });
}

// ---------------------------------------------------------------- recorrido del Markdown
const tokens = marked.lexer(readFileSync(input, 'utf8'), { gfm: true });
const children = [];
let inPortada = false;
let inRefs = false;
let expectTableTitle = false;
let tocInserted = false;

for (const t of tokens) {
  if (t.type === 'space') continue;

  if (t.type === 'html') {
    const h = t.text.trim();
    if (h.startsWith('<div class="portada">')) {
      inPortada = true;
      children.push(plain([new TextRun('')]), plain([new TextRun('')]), plain([new TextRun('')]));
      continue;
    }
    if (h.startsWith('<div class="referencias">')) { inRefs = true; continue; }
    if (h.startsWith('</div>')) { inPortada = false; inRefs = false; continue; }
    if (h.startsWith('<div class="salto">')) { children.push(new Paragraph({ children: [new PageBreak()] })); continue; }
    if (h.startsWith('<figure>')) { children.push(...figure(h)); continue; }
    if (h.startsWith('<pre class="evidencia">')) {
      children.push(codeBox(h.replace(/^<pre class="evidencia">/, '').replace(/<\/pre>$/, '')));
      children.push(plain([new TextRun('')], { spacing: { line: 240 } }));
      continue;
    }
    if (inPortada) {
      children.push(plain(htmlRuns(h.replace(/^<p>|<\/p>$/g, '')), { alignment: AlignmentType.CENTER }));
      continue;
    }
    continue;
  }

  if (t.type === 'heading') {
    // Tabla de contenido antes de la Introduccion (despues del resumen)
    if (!tocInserted && t.depth === 1 && t.text === 'Introducción') {
      children.push(
        plain([new TextRun({ text: 'Tabla de contenido', bold: true })], { alignment: AlignmentType.CENTER }),
        new TableOfContents('Tabla de contenido', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({ children: [new PageBreak()] }),
      );
      tocInserted = true;
    }
    const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][Math.min(t.depth, 3) - 1];
    children.push(new Paragraph({ heading: level, children: runs(t.tokens), keepNext: true }));
    continue;
  }

  if (t.type === 'paragraph') {
    const only = t.tokens.length === 1 ? t.tokens[0] : null;
    if (only?.type === 'strong' && /^(Tabla|Figura) [A-Z]?\d+$/.test(only.text)) {
      children.push(plain(runs(t.tokens), { keepNext: true, spacing: { line: DOUBLE, before: 240 } }));
      expectTableTitle = true;
      continue;
    }
    if (expectTableTitle && only?.type === 'em') {
      children.push(plain(runs(t.tokens), { keepNext: true }));
      expectTableTitle = false;
      continue;
    }
    expectTableTitle = false;
    if (t.tokens[0]?.type === 'em' && t.tokens[0].text === 'Nota.') {
      children.push(noteParagraph(runs(t.tokens, { size: 20 })));
      continue;
    }
    if (inRefs) {
      children.push(new Paragraph({ children: runs(t.tokens), spacing: { line: DOUBLE }, indent: { left: INDENT, hanging: INDENT } }));
      continue;
    }
    children.push(body(runs(t.tokens)));
    continue;
  }

  if (t.type === 'list') {
    t.items.forEach((item, i) => {
      const bullet = t.ordered ? `${(Number(t.start) || 1) + i}.` : '•';
      const inline = item.tokens.flatMap((x) => (x.type === 'text' || x.type === 'paragraph' ? x.tokens ?? [x] : [x]));
      children.push(new Paragraph({
        spacing: { line: DOUBLE },
        indent: { left: INDENT + 360, hanging: 360 },
        children: [new TextRun({ text: `${bullet}\t` }), ...runs(inline)],
        tabStops: [{ type: 'left', position: INDENT + 360 }],
      }));
    });
    continue;
  }

  if (t.type === 'table') { children.push(table(t)); continue; }
  if (t.type === 'code') { children.push(codeBox(t.text)); continue; }
}

const heading = (id, name, extra) => ({
  id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
  run: { font: FONT, size: BODY, bold: true, color: '000000', ...extra.run },
  paragraph: { spacing: { line: DOUBLE, before: 0, after: 0 }, keepNext: true, ...extra.paragraph },
});

const doc = new Document({
  creator: 'Equipo RADAR',
  title: 'Informe técnico de auditoría, pruebas de software y corrección de defectos - RADAR',
  description: 'Informe de pruebas con correcciones y verificación de regresión (APA 7)',
  features: { updateFields: true },
  styles: {
    default: {
      document: { run: { font: FONT, size: BODY, color: '000000' }, paragraph: { spacing: { line: DOUBLE } } },
    },
    paragraphStyles: [
      heading('Heading1', 'Heading 1', { paragraph: { alignment: AlignmentType.CENTER } }),
      heading('Heading2', 'Heading 2', { paragraph: { alignment: AlignmentType.LEFT } }),
      heading('Heading3', 'Heading 3', { run: { italics: true }, paragraph: { alignment: AlignmentType.LEFT } }),
      // Tabla de contenido compacta (interlineado 1,5) para que no ocupe varias paginas
      { id: 'TOC1', name: 'toc 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: BODY }, paragraph: { spacing: { line: 360, before: 0, after: 0 } } },
      { id: 'TOC2', name: 'toc 2', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: BODY }, paragraph: { spacing: { line: 360, before: 0, after: 0 }, indent: { left: 480 } } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: BODY })] })],
      }),
    },
    footers: { default: new Footer({ children: [new Paragraph('')] }) },
    children,
  }],
});

writeFileSync(output, await Packer.toBuffer(doc));
console.log(`DOCX generado: ${output.replace(root + '\\', '').replace(root + '/', '')} (${children.length} bloques)`);
