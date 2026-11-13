// Validacion estatica local del workflow de GitHub Actions (no sustituye una ejecucion real en GitHub).
// Comprueba: YAML bien formado, eventos push/pull_request, jobs con runs-on y steps, acciones con version fija,
// y que los comandos invocados existan en el repositorio (mvnw, package-lock.json, scripts npm).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = resolve(root, '.github/workflows/ci.yml');
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

const doc = YAML.parseDocument(readFileSync(file, 'utf8'));
check('YAML sintacticamente valido', doc.errors.length === 0, doc.errors.map(String).join('; '));
const wf = doc.toJS();

check('Tiene nombre', typeof wf.name === 'string', wf.name);
check('Se activa en push', wf.on && 'push' in wf.on);
check('Se activa en pull_request', wf.on && 'pull_request' in wf.on);
check('Permisos minimos (contents: read)', wf.permissions?.contents === 'read');

for (const [id, job] of Object.entries(wf.jobs ?? {})) {
  check(`job ${id}: runs-on definido`, Boolean(job['runs-on']), job['runs-on']);
  check(`job ${id}: tiene steps`, Array.isArray(job.steps) && job.steps.length > 0, `${job.steps?.length} pasos`);
  for (const step of job.steps ?? []) {
    if (step.uses) {
      check(`job ${id}: accion con version fija (${step.uses})`, /@v?\d/.test(step.uses));
    }
    check(`job ${id}: paso con nombre`, Boolean(step.name), step.name ?? JSON.stringify(step).slice(0, 60));
  }
}

check('backend/mvnw existe', existsSync(resolve(root, 'backend/mvnw')));
check('frontend/package-lock.json existe (npm ci + cache)', existsSync(resolve(root, 'frontend/package-lock.json')));
const pkg = JSON.parse(readFileSync(resolve(root, 'frontend/package.json'), 'utf8'));
check('frontend: script "test" definido', Boolean(pkg.scripts?.test));
check('frontend: script "build" definido', Boolean(pkg.scripts?.build));

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? `  [${c.detail}]` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} verificaciones superadas`);
process.exit(failed ? 1 : 0);
