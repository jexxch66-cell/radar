// Genera docs/INFORME_PRUEBAS_RADAR.pdf desde docs/INFORME_PRUEBAS_RADAR.md con formato APA 7:
// carta, margenes de 2,54 cm, Times New Roman 12 pt, doble espacio, sangria de 1,27 cm,
// numero de pagina arriba a la derecha (excepto en la portada), encabezados de niveles 1-3 APA,
// tablas con numero en negrita y titulo en cursiva, y referencias con sangria francesa.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { marked } from 'marked';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const docs = resolve(root, 'docs');
const md = readFileSync(resolve(docs, 'INFORME_PRUEBAS_RADAR.md'), 'utf8');

// Envuelve cada tabla con su "Tabla N" + titulo + nota previa/posterior para mantenerlos juntos
let body = marked.parse(md, { gfm: true });
body = body.replace(
  /<p><strong>(Tabla [A-Z]?\d+)<\/strong><\/p>\s*<p><em>([\s\S]*?)<\/em><\/p>\s*(<table>[\s\S]*?<\/table>)(\s*<p><em>Nota\.<\/em>[\s\S]*?<\/p>)?/g,
  (_m, num, title, table, note = '') =>
    `<div class="tabla"><p class="tabla-num"><strong>${num}</strong></p><p class="tabla-titulo"><em>${title}</em></p>${table}${note.replace('<p>', '<p class="nota">')}</div>`,
);

// Figuras APA 7: numero (negrita) y titulo (cursiva) ENCIMA de la imagen; nota debajo
body = body.replace(
  /<figure>([\s\S]*?)<figcaption><strong>(.*?)<\/strong><br><em>(.*?)<\/em><br><span class="nota">([\s\S]*?)<\/span><\/figcaption>\s*<\/figure>/g,
  (_m, content, num, title, note) =>
    `<figure><p class="fig-num"><strong>${num}</strong></p><p class="fig-titulo"><em>${title}</em></p>${content}<p class="nota">${note}</p></figure>`,
);
// Identificadores de casos (CN-01, CB-AUTH-01, E2E-API-01...) sin partirse en dos lineas
body = body.replace(/<td>((?:[A-Z0-9]{2,4}-)+[A-Z0-9]+[a-z]?)<\/td>/g, '<td class="id">$1</td>');

// Tabla de contenido (niveles 1 y 2) despues del resumen
const toc = [];
let n = 0;
body = body.replace(/<h([12])>([\s\S]*?)<\/h\1>/g, (_m, level, text) => {
  const id = `s${++n}`;
  if (!/^(Resumen)$/.test(text)) toc.push({ level, text, id });
  return `<h${level} id="${id}">${text}</h${level}>`;
});
const tocHtml = `<h1 class="toc-h">Tabla de contenido</h1><ul class="toc">${toc
  .map((t) => `<li class="toc-l${t.level}"><a href="#${t.id}">${t.text}</a></li>`)
  .join('')}</ul><div class="salto"></div>`;
body = body.replace(/(<h1 id="s\d+">Introducción<\/h1>)/, `${tocHtml}$1`);

const css = `
@page { size: Letter; margin: 2.54cm; }
html { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; }
body { margin: 0; line-height: 2; }
p { margin: 0; text-indent: 1.27cm; text-align: left; }
li > p, td p, .nota, figcaption p { text-indent: 0; }
h1, h2, h3 { font-size: 12pt; line-height: 2; margin: 0; break-after: avoid; page-break-after: avoid; }
h1 { text-align: center; font-weight: bold; margin-top: 12pt; }
h2 { text-align: left; font-weight: bold; }
h3 { text-align: left; font-weight: bold; font-style: italic; }
ul, ol { margin: 0 0 0 1.27cm; padding-left: 0.6cm; }
li { margin: 0; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; }
.salto { break-after: page; page-break-after: always; }
.portada { text-align: center; padding-top: 3cm; }
.portada p { text-indent: 0; text-align: center; margin-bottom: 0.4cm; }
.portada .portada-titulo { margin-top: 1cm; }
.tabla { margin: 12pt 0; }
.tabla-num, .tabla-titulo { text-indent: 0; line-height: 2; break-after: avoid; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; line-height: 1.3; margin-top: 4pt;
        border-top: 1.2px solid #000; border-bottom: 1.2px solid #000; }
thead { display: table-header-group; }
th { border-bottom: 1px solid #000; text-align: center; font-weight: bold; padding: 4pt 5pt; vertical-align: bottom; }
td { padding: 3.5pt 5pt; vertical-align: top; text-align: left; }
tr { break-inside: avoid; page-break-inside: avoid; }
td code, th code { font-size: 8.5pt; word-break: break-word; }
.nota { font-size: 10.5pt; line-height: 1.5; margin-top: 4pt; text-indent: 0; }
figure { margin: 14pt 0; break-inside: avoid; page-break-inside: avoid; }
figure img { display: block; max-width: 100%; max-height: 10.5cm; margin: 0 auto 4pt; border: 1px solid #999; }
.fig-num, .fig-titulo { text-indent: 0; line-height: 2; break-after: avoid; }
td.id { white-space: nowrap; }
pre.evidencia { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; line-height: 1.35;
                background: #f4f4f4; border: 1px solid #bbb; padding: 6pt; white-space: pre-wrap; margin: 0 0 6pt; }
.referencias p { padding-left: 1.27cm; text-indent: -1.27cm; word-break: break-word; }
.toc { list-style: none; margin: 0; padding: 0; line-height: 1.8; }
.toc a { color: #000; text-decoration: none; }
.toc-l2 { padding-left: 1.27cm; }
.toc-h { margin-top: 0; }
a { color: #000; }
`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe técnico de auditoría y pruebas de software - RADAR</title>
<base href="${pathToFileURL(docs + '/').href}"><style>${css}</style></head><body>${body}</body></html>`;
mkdirSync(resolve(root, 'e2e', '.run'), { recursive: true });
const htmlPath = resolve(root, 'e2e', '.run', 'informe.html');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.pdf({
  path: resolve(docs, 'INFORME_PRUEBAS_RADAR.pdf'),
  format: 'Letter',
  margin: { top: '2.54cm', bottom: '2.54cm', left: '2.54cm', right: '2.54cm' },
  displayHeaderFooter: true,
  // Numero de pagina arriba a la derecha (APA 7); la portada cuenta como pagina 1
  headerTemplate:
    '<div style="width:100%;font-family:\'Times New Roman\',serif;font-size:12pt;text-align:right;padding:0 2.54cm;margin-top:1.1cm;"><span class="pageNumber"></span></div>',
  footerTemplate: '<div></div>',
  printBackground: true,
  outline: true,
  tagged: true,
});
await browser.close();
console.log('PDF generado: docs/INFORME_PRUEBAS_RADAR.pdf');
