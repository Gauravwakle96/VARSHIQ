import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ArrowLeft, Droplets, FlaskConical, MessageSquare } from 'lucide-react'
import { Field } from '../components/ui'
import FeatureSandbox from '../features/demo/FeatureSandbox'
import { previewFeature } from '../features/demo/featureCatalogue'
import { sectionFor, workspaceSections } from '../components/workspaceNavigationData'

export default function DemoWorkspace() {
  const [params, setParams] = useSearchParams()
  const feature = previewFeature(params.get('feature') ?? '/')
  const section = sectionFor(feature.path)
  useEffect(() => { window.scrollTo(0, 0) }, [feature.path])
  const href = (path: string) => `/demo/features?feature=${encodeURIComponent(path)}`
  return (
    <MotionConfig reducedMotion="user">
      <div className="demo-page">
        <a className="skip-link" href="#feature-main" onClick={event => {
          event.preventDefault(); document.getElementById('feature-main')?.focus()
        }}>Skip to feature simulation</a>
        <header className="demo-header">
          <Link to="/demo" className="brand"><span className="brand-mark"><Droplets size={24} /></span>
            <span>VARSHIQ<small>EXPLORE THE WATER WORKSPACE</small></span>
          </Link>
          <Link to="/demo" className="button secondary"><ArrowLeft size={15} /> WaterTwin tour</Link>
        </header>
        <div className="demo-disclosure" role="note"><FlaskConical size={17} />
          <span><strong>Interactive demo.</strong> Water inputs and readings are simulated. No property records are saved.</span>
        </div>
        <div className="feature-workspace-layout">
          <aside className="feature-workspace-nav">
            <nav aria-label="Simulated feature navigation">
              {workspaceSections.map(({ to, label, icon: Icon, routes }) => <Link key={to} to={href(to)}
                aria-current={routes.includes(feature.path) ? 'page' : undefined}>
                <Icon size={18} />{label}
              </Link>)}
            </nav>
            <Link className="demo-assistant-link" to={href('/assistant')}><MessageSquare size={17} /> Water assistant</Link>
          </aside>
          <main id="feature-main" tabIndex={-1}>
            <div className="feature-workspace-mobile-nav">
              <Field label="Section to explore">
                <select aria-label="Section to explore" value={section?.to ?? '/assistant'}
                  onChange={event => setParams({ feature: event.currentTarget.value })}>
                  {workspaceSections.map(item => <option key={item.to} value={item.to}>{item.label}</option>)}
                  <option value="/assistant">Water assistant</option>
                </select>
              </Field>
            </div>
            {Boolean(section?.tabs.length) && <div className="section-navigation">
              <nav aria-label="Demo section pages">{section!.tabs.map(tab => <Link key={tab.to} to={href(tab.to)}
                aria-current={feature.path === tab.to ? 'page' : undefined}>{tab.label}</Link>)}</nav>
              {section?.to === '/twin' && <Link className="section-tool" to={href('/calculator')}>Quick calculator</Link>}
            </div>}
            <FeatureSandbox featurePath={feature.path} compact />
          </main>
        </div>
      </div>
    </MotionConfig>
  )
}
