import { Link, useSearchParams } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { ArrowLeft, Droplets, FlaskConical } from 'lucide-react'
import { Field } from '../components/ui'
import FeatureSandbox from '../features/demo/FeatureSandbox'
import { previewFeature, previewFeatures } from '../features/demo/featureCatalogue'

export default function DemoWorkspace() {
  const [params, setParams] = useSearchParams()
  const feature = previewFeature(params.get('feature') ?? '/')
  const groups = [...new Set(previewFeatures.map((item) => item.group))]
  return (
    <MotionConfig reducedMotion="user">
      <div className="demo-page">
        <a
          className="skip-link"
          href="#feature-main"
          onClick={(event) => {
            event.preventDefault()
            document.getElementById('feature-main')?.focus()
          }}
        >
          Skip to feature simulation
        </a>
        <header className="demo-header">
          <Link to="/demo" className="brand">
            <span className="brand-mark">
              <Droplets size={24} />
            </span>
            <span>
              VARSHIQ<small>EXPLORE EVERY FEATURE</small>
            </span>
          </Link>
          <Link to="/demo" className="button secondary">
            <ArrowLeft size={15} /> WaterTwin tour
          </Link>
        </header>
        <div className="demo-disclosure" role="note">
          <FlaskConical size={17} />
          <span>
            <strong>Fictional feature workspace.</strong> Model inputs, example buildings and readings are
            simulated. No actual property records or permissions are changed.
          </span>
        </div>
        <div className="feature-workspace-layout">
          <aside className="feature-workspace-nav">
            <nav aria-label="Simulated feature navigation">
              {groups.map((group) => (
                <div key={group}>
                  <h2>{group}</h2>
                  {previewFeatures
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <Link
                        key={item.path}
                        to={`/demo/features?feature=${encodeURIComponent(item.path)}`}
                        aria-current={feature.path === item.path ? 'page' : undefined}
                      >
                        {item.name}
                      </Link>
                    ))}
                </div>
              ))}
            </nav>
          </aside>
          <main id="feature-main" tabIndex={-1}>
            <div className="feature-workspace-mobile-nav">
              <Field label="Feature to simulate">
                <select
                  aria-label="Feature to simulate"
                  value={feature.path}
                  onChange={(event) => setParams({ feature: event.currentTarget.value })}
                >
                  {groups.map((group) => (
                    <optgroup key={group} label={group}>
                      {previewFeatures
                        .filter((item) => item.group === group)
                        .map((item) => (
                          <option key={item.path} value={item.path}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            </div>
            <FeatureSandbox featurePath={feature.path} />
          </main>
        </div>
      </div>
    </MotionConfig>
  )
}
