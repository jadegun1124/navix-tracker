import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function text(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function repo(path) {
  return new URL(path, import.meta.url);
}

test('vector pin and gradient replace the family-pin mark', () => {
  const svg = text('../../resources/icon.svg');
  assert.match(svg, /linearGradient/);
  assert.match(svg, /#023272/);
  assert.match(svg, /#30DDFF/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.equal(svg.includes('코기'), false);
  assert.equal(svg.includes('family'), false);

  const pin = text('../../resources/icon-pin.svg');
  assert.match(pin, /fill-rule="evenodd"/);
  assert.match(pin, /#ffffff/i);

  const agents = text('../../AGENTS.md');
  assert.match(agents, /icon\.svg/);
  assert.equal(agents.includes('코기'), false);
  assert.equal(agents.includes('캐리어'), false);
});

test('Android adaptive, monochrome, and notification icons are vectors', () => {
  const adaptive = text('../../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
  assert.match(adaptive, /@drawable\/ic_launcher_background/);
  assert.match(adaptive, /@drawable\/ic_launcher_foreground/);
  assert.match(adaptive, /@drawable\/ic_launcher_monochrome/);

  const background = text('../../android/app/src/main/res/drawable/ic_launcher_background.xml');
  assert.match(background, /<gradient/);
  assert.match(background, /#FF023272/);
  assert.match(background, /#FF30DDFF/);

  const foreground = text('../../android/app/src/main/res/drawable/ic_launcher_foreground.xml');
  assert.match(foreground, /evenOdd/);
  assert.match(foreground, /#FFFFFFFF/);

  const mono = text('../../android/app/src/main/res/drawable/ic_launcher_monochrome.xml');
  assert.match(mono, /#FFFFFFFF/);
  assert.equal(mono.includes('evenOdd'), false);

  const notify = text('../../android/app/src/main/res/drawable/ic_stat_notify.xml');
  assert.match(notify, /android:width="24dp"/);
  assert.match(notify, /#FFFFFFFF/);

  const java = text('../../android/app/src/main/java/kr/co/umap/tracker/AlertWatchService.java');
  assert.match(java, /R\.drawable\.ic_stat_notify/);
  assert.equal(java.includes('android.R.drawable.ic_dialog_'), false);
});

test('legacy mipmaps, web icons, and maskable PWA icons are present', () => {
  const files = [
    '../../android/app/src/main/res/mipmap-mdpi/ic_launcher.png',
    '../../android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png',
    '../../android/app/src/main/res/mipmap-hdpi/ic_launcher.png',
    '../../android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',
    '../../android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',
    '../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',
    '../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png',
    '../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    '../../public/favicon.png',
    '../../public/apple-touch-icon.png',
    '../../public/umap-icon-192.png',
    '../../public/umap-icon-512.png',
    '../../public/umap-icon-192-maskable.png',
    '../../public/umap-icon-512-maskable.png',
    '../../resources/icon-master.png',
    '../../resources/icon.svg',
  ];
  for (const file of files) {
    assert.equal(existsSync(repo(file)), true, file);
  }

  const manifest = JSON.parse(text('../../public/manifest.json'));
  assert.equal(manifest.background_color, '#023272');
  const purposes = manifest.icons.map((icon) => `${icon.src}:${icon.purpose}`);
  assert.ok(purposes.includes('umap-icon-192.png:any'));
  assert.ok(purposes.includes('umap-icon-512.png:any'));
  assert.ok(purposes.includes('umap-icon-192-maskable.png:maskable'));
  assert.ok(purposes.includes('umap-icon-512-maskable.png:maskable'));
});
