/**
 * Gera os ícones do aplicativo a partir de um SVG.
 *
 * Renderiza no Chromium que o ambiente já tem, em vez de acrescentar uma
 * biblioteca de imagem ao projeto só para desenhar um quadrado com "R$".
 * Rode com `npm run build:icons` quando o desenho do ícone mudar; o
 * resultado fica versionado em `public/`.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

/** `padded` deixa margem para o Android recortar o ícone em círculo. */
function svg(size, { padded = false } = {}) {
  const radius = padded ? size / 2 : size * 0.22;
  const inset = padded ? size * 0.12 : 0;
  const fonte = (size - inset * 2) * 0.42;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${padded ? 0 : radius}" fill="${padded ? '#2a78d6' : '#2a78d6'}"/>
    <text x="50%" y="50%" dy="0.36em" text-anchor="middle"
          font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          font-weight="650" font-size="${fonte}" fill="#ffffff">R$</text>
  </svg>`;
}

const alvos = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // O iPhone ignora o manifesto e usa esta, sempre sem transparência.
  { file: 'apple-touch-icon.png', size: 180 },
  // "Maskable": o Android recorta em círculo, então o desenho precisa de margem.
  { file: 'icon-maskable-512.png', size: 512, padded: true },
];

await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

for (const { file, size, padded } of alvos) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0">${svg(size, { padded })}</body>`,
    { waitUntil: 'load' },
  );
  const png = await page.screenshot({ omitBackground: false });
  await writeFile(join(out, file), png);
  await page.close();
  console.log(`${file} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

// O favicon fica como SVG: escala em qualquer tamanho e pesa quase nada.
await writeFile(join(out, 'favicon.svg'), svg(64));
console.log('favicon.svg');

await browser.close();
