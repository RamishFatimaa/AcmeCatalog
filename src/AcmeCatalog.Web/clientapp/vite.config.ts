import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, this app runs on its own Vite server and proxies API/static-asset
// calls to the real ASP.NET Core backend on :5274. In production, the build
// output is served directly BY that same backend (see Program.cs), so those
// paths just resolve same-origin with no proxy involved.
export default defineConfig({
  plugins: [react()],
  // The build output lives at wwwroot/clientapp-dist/ (a subdirectory), but
  // Vite defaults to assuming its bundle is served from the site root, so
  // its generated index.html referenced /assets/app.js — a 404, since that
  // file actually lives at /clientapp-dist/assets/app.js. This makes the
  // generated references match where the files are actually served from.
  base: '/clientapp-dist/',
  server: {
    proxy: {
      '/api': 'http://localhost:5274',
      '/Items': 'http://localhost:5274',
      '/lib': 'http://localhost:5274',
      '/css': 'http://localhost:5274',
      '/uploads': 'http://localhost:5274',
    },
  },
  build: {
    outDir: '../wwwroot/clientapp-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Fixed filenames (no content hash) so the Razor shell can reference
        // them directly without parsing Vite's manifest.json. Trades away
        // long-term browser cache-busting for a much simpler integration —
        // an acceptable call for a low-traffic demo app.
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/app[extname]',
      },
    },
  },
})
