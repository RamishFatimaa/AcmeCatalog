// The frontend is a standalone static site now, not something either backend
// serves — these are the two real origins it talks to. VITE_* vars let each
// deploy target (local dev, CI, the eventual Static Web Apps deploy) point
// at different hosts without a code change; the fallbacks are local dev's
// own default ports for identity-service/catalog-service.
export const IDENTITY_SERVICE_URL = import.meta.env.VITE_IDENTITY_SERVICE_URL ?? 'http://localhost:5301'
export const CATALOG_SERVICE_URL = import.meta.env.VITE_CATALOG_SERVICE_URL ?? 'http://localhost:5302'
