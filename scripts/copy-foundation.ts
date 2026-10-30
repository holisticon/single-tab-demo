import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = new URL('../', import.meta.url);

function assertInsideProject(directory: URL): void {
  const path = relative(
    fileURLToPath(projectDirectory),
    fileURLToPath(directory),
  );

  if (path.startsWith('..') || isAbsolute(path)) {
    throw new Error('Foundation assets must be installed inside this project.');
  }
}

async function findPackageDirectory(stylesheet: URL): Promise<URL> {
  let directory = new URL('./', stylesheet);

  while (directory.href !== projectDirectory.href) {
    assertInsideProject(directory);

    try {
      const metadata: unknown = JSON.parse(
        await readFile(new URL('package.json', directory), 'utf8'),
      );

      if (
        typeof metadata === 'object' &&
        metadata !== null &&
        'name' in metadata &&
        metadata.name === '@holisticon/hap-foundation'
      ) {
        return directory;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    directory = new URL('../', directory);
  }

  throw new Error('Cannot find the installed HAP foundation package.');
}

export async function copyFoundation(
  outputDirectory: URL,
  stylesheetEntry: string,
): Promise<void> {
  assertInsideProject(outputDirectory);
  const stylesheet = new URL(stylesheetEntry);
  assertInsideProject(stylesheet);
  const packageDirectory = await findPackageDirectory(stylesheet);
  const destination = new URL('assets/hap-foundation/', outputDirectory);

  await rm(destination, { recursive: true, force: true });
  await cp(packageDirectory, destination, {
    recursive: true,
    filter: (source) =>
      !relative(fileURLToPath(packageDirectory), source)
        .split(/[\\/]/)
        .includes('node_modules'),
  });
  const entryPath = relative(
    fileURLToPath(packageDirectory),
    fileURLToPath(stylesheet),
  ).replaceAll('\\', '/');
  await writeFile(
    new URL('hap-foundation.css', outputDirectory),
    `@import url('./assets/hap-foundation/${entryPath}');\n`,
  );
  await cp(
    new URL('../styles/hap-app.css', import.meta.url),
    new URL('hap-app.css', outputDirectory),
  );
}
