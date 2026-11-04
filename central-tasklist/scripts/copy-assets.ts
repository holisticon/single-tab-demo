import { cp } from 'node:fs/promises';
import { copyFoundation } from '../../scripts/copy-foundation.ts';

await cp(
  new URL('../public/', import.meta.url),
  new URL('../dist/', import.meta.url),
  {
    recursive: true,
  },
);

await copyFoundation(
  new URL('../dist/', import.meta.url),
  import.meta.resolve('@holisticon/hap-foundation/atomic-playfulness.css'),
);
