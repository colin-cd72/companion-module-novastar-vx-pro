import { build } from 'esbuild';
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';

const OUT = 'pkg';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Bundle src/main.js -> pkg/main.js as a single-file CJS bundle
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: `${OUT}/main.js`,
  external: ['electron'],
  minify: false,
  sourcemap: false,
});

// 2. Copy the companion/manifest.json, but point runtime.entrypoint at ../main.js
const manifest = JSON.parse(readFileSync('companion/manifest.json', 'utf8'));
manifest.runtime.entrypoint = '../main.js';
manifest.runtime.type = 'node18';
mkdirSync(`${OUT}/companion`, { recursive: true });
writeFileSync(`${OUT}/companion/manifest.json`, JSON.stringify(manifest, null, 2));

// 3. Emit a minimal package.json in pkg/ for npm pack
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const pkgOut = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: 'main.js',
  license: pkg.license || 'MIT',
};
writeFileSync(`${OUT}/package.json`, JSON.stringify(pkgOut, null, 2));

console.log('Built into', OUT);
