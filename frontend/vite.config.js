import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react(), iconVersionPlugin()],
})
