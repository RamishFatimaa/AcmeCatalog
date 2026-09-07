import { useState } from 'react'

const COOKIE_NAME = 'acmecatalog_cookie_consent'

// The one place this app uses a real cookie instead of localStorage/
// sessionStorage — deliberately, so cy.getCookie()/setCookie()/clearCookie()
// have something genuine to exercise (everything else in the app is
// localStorage/sessionStorage-based).
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

export function CookieBanner() {
  const [visible, setVisible] = useState(() => readCookie(COOKIE_NAME) === null)

  function respond(choice: 'accepted' | 'declined') {
    writeCookie(COOKIE_NAME, choice, 365)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" data-testid="cookie-banner" role="region" aria-label="Cookie consent">
      <p className="mb-2 mb-md-0">
        This site uses a single cookie to remember your choice here. No tracking, no third parties.
      </p>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-primary" data-testid="cookie-accept-btn" onClick={() => respond('accepted')}>
          Accept
        </button>
        {/* btn-outline-secondary is tuned dark-on-light for the rest of the
            app; on this banner's dark background that's ~1.5:1 contrast.
            btn-outline-light (already used on HomePage's similarly dark
            hero) is the one meant for a dark background. */}
        <button type="button" className="btn btn-sm btn-outline-light" data-testid="cookie-decline-btn" onClick={() => respond('declined')}>
          Decline
        </button>
      </div>
    </div>
  )
}
