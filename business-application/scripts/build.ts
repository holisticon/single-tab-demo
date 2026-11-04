import { cp, rm } from 'node:fs/promises';
import { copyFoundation } from '../../scripts/copy-foundation.ts';

const outputDirectory = new URL('../dist/', import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await cp(new URL('../public/', import.meta.url), outputDirectory, {
  recursive: true,
});

await copyFoundation(
  outputDirectory,
  import.meta.resolve('@holisticon/hap-foundation/atomic-playfulness.css'),
);
