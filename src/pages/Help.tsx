import { Link } from 'react-router-dom'
import SEO, { breadcrumbSchema } from '../components/SEO'
import Assistant from '../components/support/Assistant'
import { FAQ_SECTIONS } from '../content/faqs'

export default function Help() {
  return (
    <>
      <SEO
        title="Help & Support — Get Answers Fast"
        description="Get help with your Platizio Global account. Our guided assistant answers questions about funding, trading, withdrawals, transfers and tax, and connects you to our team when you need a person."
        canonical="/help"
        jsonLd={[breadcrumbSchema([['Home', '/'], ['Help & Support', '/help']])]}
      />

      <section className="page-hero">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link><span>/</span><span>Help &amp; Support</span>
          </div>
          <h1>How can we help?</h1>
          <p>
            Tell us what you are trying to do and we will take you straight to the
            answer. If we cannot solve it, we will put you in front of someone who can.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="help-layout">
            <div className="help-main">
              <Assistant />
            </div>

            {/*
              Deliberately independent of the assistant. Someone who cannot or
              will not use a chat interface must still be able to reach every
              answer, and this content is also what search engines index.
            */}
            <aside className="help-browse" aria-labelledby="help-browse-title">
              <h2 id="help-browse-title">Browse the FAQs</h2>
              <p>Prefer to look for yourself? Every answer lives here too.</p>
              <ul className="help-browse-list">
                {FAQ_SECTIONS.map((section) => (
                  <li key={section.id}>
                    <Link to={`/faqs#${section.id}`}>
                      <span className="help-browse-num">{section.num}</span>
                      {section.title}
                      <span className="help-browse-count">{section.items.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link className="help-browse-all" to="/faqs">
                See all FAQs →
              </Link>
            </aside>
          </div>
        </div>
      </section>
    </>
  )
}
