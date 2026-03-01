import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'Lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'Typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { name: 'Test', command: 'npm', args: ['run', 'test'] },
];

const started = Date.now();

function section(title) {
  const bar = '='.repeat(72);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(bar);
}

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

section('OpenCode Remote Verification Pipeline');
console.log('Running single-source quality checks with structured output.');

for (const step of steps) {
  const stepStart = Date.now();
  section(`Step: ${step.name}`);
  console.log(`$ ${step.command} ${step.args.join(' ')}`);

  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
  });

  const stepDuration = Date.now() - stepStart;
  if (result.status !== 0) {
    console.log(`\n❌ ${step.name} failed after ${fmtMs(stepDuration)}`);
    console.log(`🧭 Verification stopped at: ${step.name}`);
    process.exit(result.status || 1);
  }

  console.log(`\n✅ ${step.name} passed in ${fmtMs(stepDuration)}`);
}

section('Verification Complete');
console.log(`✅ All checks passed in ${fmtMs(Date.now() - started)}`);
