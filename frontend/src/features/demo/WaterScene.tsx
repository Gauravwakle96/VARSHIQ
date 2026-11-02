import { useEffect, useId, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import type { Simulation } from '../../types'
import type { FlowFrame } from './data'
import { Button, number } from '../../components/ui'

export default function WaterScene({
  simulation,
  onFrame,
}: {
  simulation: Simulation
  onFrame: (frame: FlowFrame) => void
}) {
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(!reduced)
  const clip = useId().replaceAll(':', '')
  const length = simulation.hourly.length
  const current = frame > 0 ? simulation.hourly[frame - 1] : null
  const storage = current?.storage_l ?? simulation.initial_storage_l
  const fraction = Math.max(0, Math.min(1, storage / simulation.capacity_l))
  const animate = playing && !reduced && frame < length
  const raining = (current?.rainfall_mm ?? 0) > 0
  const inflow = (current?.net_inflow_l ?? 0) > 0
  const overflow = (current?.overflow_l ?? 0) > 0
  const supplied = (current?.water_supplied_l ?? 0) > 0
  useEffect(() => {
    if (!animate) return
    const timer = window.setInterval(() => setFrame((value) => Math.min(length, value + 1)), 700)
    return () => window.clearInterval(timer)
  }, [animate, length])
  useEffect(() => {
    onFrame({
      hour: frame,
      storage_l: storage,
      capacity_l: simulation.capacity_l,
      rainfall_mm: current?.rainfall_mm ?? 0,
      overflow_l: current?.overflow_l ?? 0,
      playing: animate,
    })
  }, [frame, storage, simulation.capacity_l, current?.rainfall_mm, current?.overflow_l, animate, onFrame])
  function replay() {
    setFrame(0)
    setPlaying(!reduced)
  }
  return (
    <section
      className="demo-water-scene"
      aria-labelledby="demo-scene-title"
      data-testid="demo-scene"
      data-hour={frame}
      data-storage={storage}
      data-capacity={simulation.capacity_l}
    >
      <div className="demo-scene-heading">
        <div>
          <span>SIMULATED WATERTWIN</span>
          <h2 id="demo-scene-title">Rain → roof → tank → demand</h2>
        </div>
        <span className="demo-hour">
          Hour {frame} / {length}
        </span>
      </div>
      <svg
        viewBox="0 0 610 310"
        role="img"
        aria-label={`Simulated tank ${number(fraction * 100, 1)} percent full at scenario hour ${frame}. ${raining ? 'Synthetic rainfall is occurring.' : 'This simulated hour is dry.'}`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x="388" y="119" width="116" height="138" rx="12" />
          </clipPath>
          <linearGradient id={`${clip}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#72d6de" />
            <stop offset="1" stopColor="#2b8eaa" />
          </linearGradient>
        </defs>
        <path d="M24 261H588" stroke="#426276" strokeDasharray="3 7" />
        <path
          d="M75 138L170 79L265 138"
          fill="#476a7e"
          stroke="#add5df"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M92 140V259H248V140" fill="#183b52" stroke="#799fb2" strokeWidth="2" />
        <path
          d="M154 211H187V259M114 161H137V191H114ZM204 161H226V191H204Z"
          fill="none"
          stroke="#8dafbf"
          strokeWidth="2"
        />
        <path
          d="M265 138H291V174H328V187H388"
          fill="none"
          stroke="#9cbcca"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <motion.path
          d="M265 138H291V174H328V187H388"
          fill="none"
          stroke="#74d7dc"
          strokeWidth="3"
          strokeDasharray="5 12"
          opacity={inflow ? 1 : 0.15}
          animate={animate && inflow ? { strokeDashoffset: [0, -34] } : { strokeDashoffset: 0 }}
          transition={
            animate && inflow ? { duration: 1.2, repeat: Infinity, ease: 'linear' } : { duration: 0 }
          }
        />
        <path
          d="M291 175V232H312"
          fill="none"
          stroke={(current?.first_flush_l ?? 0) > 0 ? '#efbb6a' : '#536d7b'}
          strokeWidth="4"
        />
        <rect x="315" y="167" width="27" height="34" rx="5" fill="#153345" stroke="#b7ccbd" strokeWidth="2" />
        <path d="M321 176H336M321 183H336M321 190H336" stroke="#b7ccbd" strokeWidth="2" />
        <rect
          x="385"
          y="116"
          width="122"
          height="144"
          rx="15"
          fill="#1c4358"
          stroke="#a2c7d7"
          strokeWidth="2"
        />
        <g clipPath={`url(#${clip})`}>
          <motion.rect
            x="388"
            width="116"
            fill={`url(#${clip}-water)`}
            animate={{ y: 257 - 138 * fraction, height: 138 * fraction }}
            transition={{ duration: reduced ? 0 : 0.45 }}
          />
        </g>
        <path
          d="M507 139H533V226H557"
          stroke={overflow ? '#efb366' : '#536d7b'}
          strokeWidth="4"
          fill="none"
        />
        <motion.path
          d="M507 139H533V226H557"
          stroke="#ffd99b"
          strokeWidth="2"
          fill="none"
          strokeDasharray="4 10"
          opacity={overflow ? 1 : 0}
          animate={animate && overflow ? { strokeDashoffset: [0, -28] } : { strokeDashoffset: 0 }}
          transition={
            animate && overflow ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0 }
          }
        />
        <path d="M507 246H562V260" fill="none" stroke={supplied ? '#76d9b0' : '#536d7b'} strokeWidth="4" />
        {[107, 130, 154, 178, 202, 226].map((x, i) => (
          <motion.path
            key={x}
            d={`M${x} 26L${x - 3} 38`}
            stroke="#8de0ee"
            strokeWidth={Math.min(3, 1 + (current?.rainfall_mm ?? 0) / 5)}
            strokeLinecap="round"
            animate={
              animate && raining
                ? { y: [0, 34], opacity: [0, 0.9, 0] }
                : { y: 16, opacity: raining ? 0.65 : 0 }
            }
            transition={
              animate && raining
                ? { duration: 0.8, repeat: Infinity, delay: i * 0.1, ease: 'linear' }
                : { duration: 0 }
            }
          />
        ))}
        <text x="121" y="290" fill="#d3e5ed" fontSize="12">
          Catchment
        </text>
        <text x="274" y="249" fill="#efbb6a" fontSize="11">
          First flush
        </text>
        <text x="311" y="155" fill="#d3e5ed" fontSize="11">
          Filter
        </text>
        <text x="408" y="290" fill="#d3e5ed" fontSize="12">
          Storage
        </text>
        <text x="540" y="210" fill="#efbb6a" fontSize="11">
          Overflow
        </text>
        <text x="527" y="289" fill="#a0e9c9" fontSize="11">
          Use
        </text>
        <text
          x="446"
          y="97"
          textAnchor="middle"
          fill="#e0f7ff"
          fontSize="20"
          fontFamily="Manrope, sans-serif"
        >
          {number(fraction * 100, 1)}%
        </text>
      </svg>
      <div className="demo-scene-readings">
        <div>
          <span>Tank at this hour</span>
          <strong>
            {number(storage)} <small>L</small>
          </strong>
        </div>
        <div>
          <span>Synthetic rainfall</span>
          <strong>
            {number(current?.rainfall_mm ?? 0, 2)} <small>mm</small>
          </strong>
        </div>
        <div>
          <span>Hourly overflow</span>
          <strong>
            {number(current?.overflow_l ?? 0)} <small>L</small>
          </strong>
        </div>
      </div>
      <label className="demo-timeline">
        <span>
          Simulation timeline{' '}
          <small>
            {frame === 0
              ? 'Starting storage assumption'
              : `Day ${Math.floor((frame - 1) / 24) + 1} · hour ${((frame - 1) % 24) + 1}`}
          </small>
        </span>
        <input
          aria-label="Simulation hour"
          type="range"
          min={0}
          max={length}
          step={1}
          value={frame}
          onChange={(event) => {
            setFrame(Number(event.target.value))
            setPlaying(false)
          }}
        />
      </label>
      <div className="demo-playback">
        <Button
          variant="secondary"
          disabled={Boolean(reduced)}
          onClick={() => {
            if (frame >= length) replay()
            else setPlaying((value) => !value)
          }}
        >
          {animate ? <Pause size={16} /> : <Play size={16} />}
          {reduced
            ? 'Reduced motion'
            : animate
              ? 'Pause animation'
              : frame >= length
                ? 'Replay animation'
                : 'Play animation'}
        </Button>
        <button
          className="demo-icon-button"
          aria-label="Previous simulation hour"
          disabled={frame === 0}
          onClick={() => {
            setPlaying(false)
            setFrame((value) => Math.max(0, value - 1))
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="demo-icon-button"
          aria-label="Next simulation hour"
          disabled={frame === length}
          onClick={() => {
            setPlaying(false)
            setFrame((value) => Math.min(length, value + 1))
          }}
        >
          <ChevronRight size={18} />
        </button>
        <button className="demo-icon-button" aria-label="Reset simulation timeline" onClick={replay}>
          <RotateCcw size={17} />
        </button>
      </div>
      <p className="demo-scene-caption">
        {reduced
          ? 'Motion is reduced. Step through hours or move the timeline.'
          : '48 model hours play in about 34 seconds. Pause to inspect any hour.'}{' '}
        All readings here are simulated.
      </p>
    </section>
  )
}
