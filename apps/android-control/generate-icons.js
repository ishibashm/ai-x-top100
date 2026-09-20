// アイコン生成スクリプト
// 使用方法: npm install sharp && node generate-icons.js

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generateIcons() {
  try {
    // sharpをダイナミックインポート
    const sharp = (await import('sharp')).default;
    
    const svgPath = join(__dirname, 'public', 'icon.svg');
    const svg = readFileSync(svgPath);

    console.log('Generating icons from icon.svg...');

    // 192x192
    await sharp(svg)
      .resize(192, 192)
      .png()
      .toFile(join(__dirname, 'public', 'icon-192.png'));
    console.log('✓ icon-192.png generated');

    // 512x512
    await sharp(svg)
      .resize(512, 512)
      .png()
      .toFile(join(__dirname, 'public', 'icon-512.png'));
    console.log('✓ icon-512.png generated');

    console.log('\nIcons generated successfully!');
    console.log('You can now use the PWA with proper icons.');
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('\nError: sharp module not found.');
      console.error('Please install it with: npm install sharp');
      console.error('\nAlternatively, you can:');
      console.error('1. Use online tools: https://www.svgviewer.dev/');
      console.error('2. Use Inkscape or ImageMagick (see ICONS.md)');
    } else {
      console.error('Error generating icons:', err);
    }
    process.exit(1);
  }
}

generateIcons();
