import { cp, rm } from 'node:fs/promises';

const outputDirectory = new URL('../dist/', import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await cp(new URL('../public/', import.meta.url), outputDirectory, {
  recursive: true,
});
