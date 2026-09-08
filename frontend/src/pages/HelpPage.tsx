import { useState } from 'react'
import { Link } from 'react-router-dom'

const FAQS = [
  {
    id: 'faq-1',
    question: 'Does reordering items persist?',
    answer: 'Yes. Dragging a card on the Catalog page saves the new order to the database immediately, no save button required.',
  },
  {
    id: 'faq-2',
    question: 'What image formats can I upload?',
    answer: 'Any standard web image format (JPEG, PNG, GIF, WebP). You can also skip the upload and paste an image URL instead.',
  },
  {
    id: 'faq-3',
    question: 'Is there an API I can call directly?',
    answer: (
      <>
        Yes &mdash; a REST API is available at <code>/api/items</code> supporting GET, POST, PUT, and DELETE.
        Full interactive docs live at <a href="/swagger">/swagger</a>.
      </>
    ),
  },
  {
    id: 'faq-4',
    question: 'Do I need an account?',
    answer: (
      <>
        Browsing, searching, and viewing items is open to everyone. Adding, editing, deleting, or
        reordering items requires a free account &mdash; <Link to="/Account/Register">sign up here</Link>.
      </>
    ),
  },
]

export function HelpPage() {
  const [openId, setOpenId] = useState<string | null>('faq-1')

  return (
    <div>
      <div className="section-eyebrow">Support</div>
      <h1 className="mb-2">Help &amp; FAQ</h1>
      <p className="text-muted">Everything below the divider is embedded from a separate static document via an iframe.</p>

      <iframe
        id="help-frame"
        title="AcmeCatalog Help Content"
        src="/help-content.html"
        className="rounded-4 shadow-sm"
        style={{ width: '100%', minHeight: 320, border: '1px solid var(--brand-border)' }}
      />

      <h2 className="mt-5">Frequently Asked Questions</h2>
      <div className="accordion" id="faq-accordion">
        {FAQS.map((faq) => {
          const isOpen = openId === faq.id
          return (
            <div className="accordion-item" key={faq.id}>
              <h2 className="accordion-header">
                <button
                  className={`accordion-button ${isOpen ? '' : 'collapsed'}`}
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                >
                  {faq.question}
                </button>
              </h2>
              <div className={`accordion-collapse collapse ${isOpen ? 'show' : ''}`}>
                <div className="accordion-body">{faq.answer}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
