import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveBuildSha() {
  const git = (args, fallback) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return fallback;
    }
  };
  return process.env.GITHUB_SHA || git('rev-parse HEAD', 'unknown');
}

// Variables the app cannot function without in a real build.
//
// api.js falls back to `BASE_URL = 'mock'` when VITE_API_URL is unset, which is
// right for local development and catastrophic in production: the bundle serves
// fabricated data with no error anywhere. That is exactly what shipped once, when
// CI built without frontend/.env (gitignored, so absent on a fresh checkout) —
// production came up with an empty admin panel, no profile, no CV, and existing
// users pushed into onboarding, while the database was untouched the whole time.
//
// A silent fallback to fake data is not an acceptable production default, so a
// build without these now fails here instead of succeeding and lying.
const REQUIRED_BUILD_ENV = [
  'VITE_API_URL',
  'VITE_USER_POOL_ID',
  'VITE_USER_POOL_CLIENT_ID',
]

function assertBuildEnv(env) {
  const missing = REQUIRED_BUILD_ENV.filter((key) => !env[key])
  if (missing.length === 0) return

  throw new Error(
    [
      '',
      'Refusing to build: required environment variables are missing.',
      '',
      ...missing.map((k) => `  - ${k}`),
      '',
      'Without VITE_API_URL the bundle silently serves mock data instead of talking',
      'to the API. Locally: copy frontend/.env.example to frontend/.env and fill it',
      'in. In CI: set them on the build step in .github/workflows/deploy.yml.',
      '',
    ].join('\n'),
  )
}

// Emits dist/version.json so it is possible to ask the live site what it is
// running. Without it, "which commit is in production?" could only be answered by
// comparing bundle hashes by hand — and the deploy builds from the working tree,
// so a matching hash never actually proved which commit it came from.
//
//   curl https://<host>/version.json
//
// In CI the SHA comes from GITHUB_SHA. Locally it comes from git, and `dirty` says
// whether the tree had uncommitted changes at build time — which is exactly the
// state that makes a deploy unreproducible.
function buildInfoPlugin() {
  const git = (args, fallback) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return fallback;
    }
  };

  return {
    name: 'build-info',
    apply: 'build',
    generateBundle() {
      const sha = resolveBuildSha();
      const info = {
        commit: sha,
        shortCommit: sha.slice(0, 7),
        branch: process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD', 'unknown'),
        dirty: process.env.GITHUB_SHA ? false : git('status --porcelain', '') !== '',
        builtAt: new Date().toISOString(),
        // Present when built by GitHub Actions — a link straight to the run that
        // produced whatever is live.
        runId: process.env.GITHUB_RUN_ID || null,
      };
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(info, null, 2) + '\n',
      });
    },
  };
}

// Emits dist/sw.js from sw-src/sw.js with the build SHA stamped in.
//
// The template lives outside public/ and outside src/ on purpose: public/ files
// are copied byte-for-byte with no processing, which is exactly what must NOT
// happen here — without the stamp, sw.js would be byte-identical across every
// deploy, and the browser's update check (a raw byte diff of this exact file)
// would never see a difference and would never detect a new version at all.
// It is not under src/ because it is not a module the app imports; it runs in
// its own worker context with a completely different global scope (self, not
// window) and must never be pulled into the main bundle.
function serviceWorkerPlugin() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle() {
      const sha = resolveBuildSha();
      const template = readFileSync(join(__dirname, 'sw-src', 'sw.js'), 'utf-8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__JOBOSS_BUILD_ID__', sha),
      });
    },
  };
}

// Appends ?v=<build-timestamp> to every /icons/ URL at build time.
// Zero component changes needed — works automatically on every deploy.
function iconVersionPlugin() {
  const version = Date.now();
  return {
    name: 'icon-version',
    transform(code, id) {
      if (!id.endsWith('.jsx') && !id.endsWith('.js') && !id.endsWith('.tsx')) return;
      // Match plain strings: "/icons/foo.png"
      let result = code.replace(
        /(["'`])(\/icons\/[^"'`]+\.(?:png|svg|ico|jpg|webp))(["'`])/g,
        (_, q1, path, q2) => `${q1}${path}?v=${version}${q2}`
      );
      // Match url() patterns: url(/icons/foo.png)
      result = result.replace(
        /(url\()(\/)?(icons\/[^)'"`]+\.(?:png|svg|ico|jpg|webp))(\))/g,
        (_, open, slash, path, close) => `${open}/${path}?v=${version}${close}`
      );
      return result;
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Third arg '' loads every variable, not just the VITE_-prefixed ones, and picks
  // up values passed in the environment (how CI supplies them) as well as .env.
  if (command === 'build') {
    assertBuildEnv(loadEnv(mode, process.cwd(), ''))
  }

  return {
    plugins: [react(), iconVersionPlugin(), buildInfoPlugin(), serviceWorkerPlugin()],
  }
})
