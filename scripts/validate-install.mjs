import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const required = ['id', 'name', 'version', 'minAppVersion', 'description', 'author'];
for (const field of required) if (typeof manifest[field] !== 'string' || !manifest[field].trim()) throw new Error(`manifest.json: missing ${field}`);
const repo = path.basename(execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim()).replace(/\.git$/, '');
if (manifest.id !== repo) throw new Error(`manifest id ${manifest.id} does not match repository ${repo}`);
for (const [field, value] of [['version', manifest.version], ['minAppVersion', manifest.minAppVersion]]) if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) throw new Error(`manifest ${field} is not semver: ${value}`);
if (typeof manifest.isDesktopOnly !== 'boolean') throw new Error('manifest isDesktopOnly must be boolean');
for (const file of ['manifest.json', 'main.js']) { const p = path.join(root, file); if (!fs.statSync(p).isFile() || fs.statSync(p).size === 0) throw new Error(`missing or empty install artifact: ${file}`); }
if (fs.existsSync(path.join(root, 'styles.css')) && fs.statSync(path.join(root, 'styles.css')).size === 0) throw new Error('styles.css is empty');
const bundled = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
if (/node_modules[\\/]@codemirror|@codemirror\//.test(bundled)) throw new Error('main.js contains bundled CodeMirror runtime; use Obsidian-provided packages');
if (/from ['"](?:obsidian|electron)['"]/.test(bundled)) throw new Error('main.js contains unsupported unbundled ESM runtime import');
for (const zip of fs.readdirSync(root).filter(f => f.endsWith('.zip'))) {
  const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const allowed = new Set(['manifest.json', 'main.js', ...(fs.existsSync('styles.css') ? ['styles.css'] : [])]);
  if (listing.some(f => f.includes('/') || !allowed.has(f)) || !allowed.has('manifest.json') || !allowed.has('main.js')) throw new Error(`${zip} has invalid release layout: ${listing.join(', ')}`);
  execFileSync('unzip', ['-tq', zip]);
}
console.log(`install validation passed for ${manifest.id}`);
