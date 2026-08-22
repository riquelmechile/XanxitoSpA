import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

const root = process.cwd();
const checks = [];

function add(name, ok, detail, required = true) {
  checks.push({ name, ok, detail, required });
}

const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
add('docker-daemon', docker.status === 0, docker.status === 0 ? `Docker ${docker.stdout.trim()}` : 'Docker daemon unavailable');

const fs = statfsSync(root);
const freeBytes = Number(fs.bavail) * Number(fs.bsize);
const freeGiB = freeBytes / (1024 ** 3);
add('free-disk', freeGiB >= 30, `${freeGiB.toFixed(1)} GiB free; official benchmark documents 30+ GiB`);

for (const key of ['LITELLM_API_KEY', 'LITELLM_BASE_URL', 'LITELLM_MODEL']) {
  add(`env:${key}`, Boolean(process.env[key]?.trim()), process.env[key]?.trim() ? 'configured' : 'not configured', false);
}

const platformReady = checks.filter((c) => c.required).every((c) => c.ok);
const evaluatorReady = checks.every((c) => c.ok);
const report = {
  benchmark: 'TheAgentCompany',
  version: '1.0.0',
  checkedAt: new Date().toISOString(),
  platformReady,
  evaluatorReady,
  scorePublished: false,
  checks,
  note: 'No benchmark score is valid until official task evaluators grade real trajectories.'
};
console.log(JSON.stringify(report, null, 2));
if (!platformReady) process.exitCode = 2;
