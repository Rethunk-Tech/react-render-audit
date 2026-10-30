import { spawnSync } from 'node:child_process'

// What `npm publish` would upload. The declaration maps point at ../src/*.ts, so a package without
// `src` gives a consumer's "go to definition" nothing to land on.
const required = [
  'package.json',
  'LICENSE',
  'README.md',
  'dist/index.js',
  'dist/index.d.ts',
  'src/index.ts',
]

const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
})
if (packed.status !== 0) {
  console.error(packed.stderr)
  process.exit(1)
}

function filePaths(json: unknown): string[] {
  if (!Array.isArray(json) || json.length === 0) {
    return []
  }
  const first: unknown = json[0]
  if (
    typeof first !== 'object' ||
    first === null ||
    !('files' in first) ||
    !Array.isArray(first.files)
  ) {
    return []
  }
  const paths: string[] = []
  for (const file of first.files as unknown[]) {
    if (
      typeof file === 'object' &&
      file !== null &&
      'path' in file &&
      typeof file.path === 'string'
    ) {
      paths.push(file.path)
    }
  }
  return paths
}

const paths = filePaths(JSON.parse(packed.stdout))
const problems = [
  ...required.filter((path) => !paths.includes(path)).map((path) => `missing ${path}`),
  ...paths
    .filter((path) => path.startsWith('dist/') && /\.test\./.test(path))
    .map((path) => `test file shipped: ${path}`),
  ...paths
    .filter((path) => path.endsWith('.tsbuildinfo'))
    .map((path) => `build info shipped: ${path}`),
]
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`${paths.length} files in the package`)
