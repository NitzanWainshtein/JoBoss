import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
      const sha = process.env.GITHUB_SHA || git('rev-parse HEAD', 'unknown');
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

export default defineConfig({
  plugins: [react(), iconVersionPlugin(), buildInfoPlugin()],
})
