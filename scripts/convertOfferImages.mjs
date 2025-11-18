import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function slugify(input) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .replace(/--+/g, '-');
}

async function convert() {
  const files = fs.readdirSync(PUBLIC_DIR);
  const targets = files.filter((f) => /^Offre\s*canal\+?\s*/i.test(f) && f.toLowerCase().endsWith('.png'));
  if (targets.length === 0) {
    console.log('No matching PNG files found in /public.');
    return;
  }
  console.log('Found offer images:', targets);

  for (const file of targets) {
    const abs = path.join(PUBLIC_DIR, file);
    const base = path.basename(file, path.extname(file));
    const mapping = {
      'offre canal +': 'offre-canal-plus',
      'offre canal+': 'offre-canal-plus',
      'offre canal+ 100%': 'offre-100-canal-plus',
      'offre canal+ cine series': 'offre-canal-plus-cine-series',
      'offre canal+ sport': 'offre-canal-plus-sport',
    };

    const simple = slugify(base.replace(/%/g, ''));
    const key = base
      .toLowerCase()
      .replace(/%/g, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let targetName = mapping[key] || simple;
    if (/100/.test(key) && !/100.*canal/.test(targetName)) {
      targetName = 'offre-100-canal-plus';
    }
    const out = path.join(PUBLIC_DIR, `${targetName}.webp`);

    try {
      await sharp(abs)
        .webp({ quality: 82 })
        .toFile(out);
      console.log('Converted ->', path.basename(out));
    } catch (e) {
      console.error('Failed to convert', file, e);
    }
  }
}

convert().catch((e) => {
  console.error(e);
  process.exit(1);
});
