import 'react'

// React 19's IntrinsicElements lives inside the "react" module's own JSX
// namespace (React.JSX), not the bare global ambient JSX namespace older
// React versions used — augmenting `declare global` here silently does
// nothing under @types/react 19.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'star-rating': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { rating?: number }
    }
  }
}
