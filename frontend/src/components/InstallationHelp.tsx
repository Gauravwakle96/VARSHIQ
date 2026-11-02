import { useState } from 'react'
import { ArrowUpRight, Check, Copy, MessageSquare, ShoppingBag, Wrench } from 'lucide-react'
import { Button, Field, InputError } from './ui'

// Public contact/shop destinations checked against the supplier's own site.
// This is an external listing, not an affiliation or an installation booking API.
const supplier = {
  name: 'Rainy Filters',
  contact: 'https://www.rainyfilters.com/contact-us/enquire',
  shop: 'https://shop.rainyfilters.com/',
  whatsapp: '919741505566',
}

export default function InstallationHelp() {
  const [open, setOpen] = useState(false)
  const [city, setCity] = useState('')
  const [need, setNeed] = useState('a new rooftop rainwater harvesting installation')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const message = `Hello, I need ${need}${city.trim() ? ` in ${city.trim()}` : ''}. ` +
    'Can you confirm service in my area and arrange a site assessment? ' +
    'Please advise on suitable filters, pipes, first-flush equipment and storage, with an itemised quote for parts and labour. ' +
    'Please also share warranty and maintenance details. Roof measurements and system suitability need to be checked on site.'
  async function copy() {
    setError(null)
    try { await navigator.clipboard.writeText(message); setCopied(true) }
    catch { setError('Copy is unavailable in this browser. Select the request text below and copy it manually.') }
  }
  return (
    <section className="installation-help" aria-labelledby="installation-title">
      <div className="installation-intro">
        <span className="installation-icon"><Wrench size={23} /></span>
        <div><div className="eyebrow">INSTALLATION & PARTS</div>
          <h2 id="installation-title">No harvesting system yet?</h2>
          <p>Ask a supplier about a complete setup, a site visit or the parts you need.</p>
        </div>
      </div>
      <div className="inline-actions">
        <Button onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="installation-request">
          <MessageSquare size={16} /> Ask about installation
        </Button>
        <a className="button secondary" href={supplier.shop} target="_blank" rel="noopener noreferrer">
          <ShoppingBag size={16} /> Browse & order parts <ArrowUpRight size={15} />
        </a>
      </div>
      <p className="supplier-note">External supplier: {supplier.name}. Local service, prices, orders and payments are confirmed by the supplier.</p>
      {open && <div id="installation-request" className="installation-request">
        <h3>Prepare your request</h3>
        <p>You can ask for a site visit even if you do not know your roof size.</p>
        <div className="form-grid">
          <Field label="City or locality" hint="An exact address is not needed for this first enquiry.">
            <input value={city} maxLength={120} placeholder="For example, Chhatrapati Sambhajinagar"
              onChange={event => { setCity(event.target.value); setCopied(false) }} />
          </Field>
          <Field label="What do you need?">
            <select aria-label="What do you need?" value={need} onChange={event => { setNeed(event.target.value); setCopied(false) }}>
              <option value="a new rooftop rainwater harvesting installation">A complete new system</option>
              <option value="filters and parts for rainwater harvesting">Filters and parts</option>
              <option value="repair or an upgrade of a rainwater harvesting system">Repair or upgrade</option>
            </select>
          </Field>
        </div>
        <Field label="Your request draft"><textarea aria-label="Your request draft" rows={5} value={message} readOnly /></Field>
        <div className="inline-actions">
          <a className="button primary" href={`https://wa.me/${supplier.whatsapp}?text=${encodeURIComponent(message)}`}
            target="_blank" rel="noopener noreferrer"><MessageSquare size={16} /> Review on WhatsApp <ArrowUpRight size={14} /></a>
          <Button variant="secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Request copied' : 'Copy request'}</Button>
          <a className="text-link" href={supplier.contact} target="_blank" rel="noopener noreferrer">Use contact form <ArrowUpRight size={14} /></a>
        </div>
        <InputError error={error} />
        <small>WhatsApp opens with this draft for you to review and send. This does not book an installation or place an order.</small>
      </div>}
    </section>
  )
}
