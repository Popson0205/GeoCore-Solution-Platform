import { useEffect, useRef } from 'react'

// Ambient survey-network backdrop: drifting geodetic points, triangulated
// by proximity, with a handful of "beacon" markers that ping like live
// GPS fixes. Reads as the thing a geospatial platform actually does —
// points becoming a network — rather than decoration.
export default function NetworkBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let points = []
    let rafId = null
    let t = 0

    const LINK_DIST = 150
    const NODE_COLOR = '64, 168, 222'
    const BEACON_COLOR = '217, 144, 0'

    function resize() {
      width = canvas.clientWidth
      height = canvas.clientHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
    }

    function seed() {
      const area = width * height
      const count = Math.max(28, Math.min(85, Math.round(area / 16000)))
      points = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        beacon: i % 9 === 0,
        phase: Math.random() * Math.PI * 2,
      }))
    }

    function step() {
      t += 1
      ctx.clearRect(0, 0, width, height)

      for (const p of points) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < -20) p.x = width + 20
        if (p.x > width + 20) p.x = -20
        if (p.y < -20) p.y = height + 20
        if (p.y > height + 20) p.y = -20
      }

      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i]
          const b = points[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.22
            ctx.strokeStyle = `rgba(${NODE_COLOR}, ${alpha})`
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }

      for (const p of points) {
        if (p.beacon) {
          const pulse = (Math.sin(t * 0.02 + p.phase) + 1) / 2
          const r = 2.2 + pulse * 1.6
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 6 * pulse, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${BEACON_COLOR}, ${0.12 * (1 - pulse)})`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${BEACON_COLOR}, 0.9)`
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${NODE_COLOR}, 0.55)`
          ctx.fill()
        }
      }

      rafId = requestAnimationFrame(step)
    }

    resize()
    window.addEventListener('resize', resize)

    if (prefersReducedMotion) {
      step()
      cancelAnimationFrame(rafId)
    } else {
      rafId = requestAnimationFrame(step)
    }

    return () => {
      window.removeEventListener('resize', resize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return <canvas ref={canvasRef} className="network-bg" aria-hidden="true" />
}
