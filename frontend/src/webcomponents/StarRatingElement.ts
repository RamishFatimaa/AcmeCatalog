// A genuine native Web Component (Shadow DOM), not a React component styled
// to look like one — this is deliberately the one place in the app that
// gives cy.shadow() a real shadow root to traverse. React only wraps it
// (see ../components/StarRatingWidget.tsx); the stars themselves, their
// click handling, and their styling all live inside the shadow tree.
class StarRatingElement extends HTMLElement {
  private currentRating = 0

  static get observedAttributes(): string[] {
    return ['rating']
  }

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' })
      shadow.innerHTML = `
        <style>
          :host { display: inline-flex; gap: 0.15rem; }
          button {
            background: none;
            border: none;
            font-size: 1.5rem;
            line-height: 1;
            padding: 0;
            cursor: pointer;
            color: #d7dde3;
          }
          button.filled { color: #d97a3f; }
        </style>
        <div id="stars"></div>
      `
    }
    this.currentRating = Number(this.getAttribute('rating')) || 0
    this.render()
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    if (name === 'rating' && oldValue !== newValue) {
      this.currentRating = Number(newValue) || 0
      this.render()
    }
  }

  private render(): void {
    const container = this.shadowRoot?.getElementById('stars')
    if (!container) return

    container.innerHTML = ''
    for (let i = 1; i <= 5; i++) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = '★'
      button.dataset.star = String(i)
      button.setAttribute('aria-label', `Rate ${i} star${i > 1 ? 's' : ''}`)
      if (i <= this.currentRating) {
        button.classList.add('filled')
      }
      button.addEventListener('click', () => {
        this.currentRating = i
        this.setAttribute('rating', String(i))
        this.dispatchEvent(
          new CustomEvent('rating-change', { detail: { rating: i }, bubbles: true, composed: true }),
        )
      })
      container.appendChild(button)
    }
  }
}

if (!customElements.get('star-rating')) {
  customElements.define('star-rating', StarRatingElement)
}

export {}
