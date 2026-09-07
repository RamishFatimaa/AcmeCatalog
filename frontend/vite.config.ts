import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A plain standalone SPA now — this used to be built into an ASP.NET Core
// app's wwwroot with a fixed, unhashed bundle filename so a Razor shell
// could reference it directly. Hosted on its own origin (Azure Static Web
// Apps) talking to identity-service/catalog-service over CORS instead, so
// none of that applies: default root basing, default content-hashed
// filenames (real long-term cache-busting, which the old fixed-name
// approach traded away only because the backend-embedding required it).
export default defineConfig({
  plugins: [react()],
})
