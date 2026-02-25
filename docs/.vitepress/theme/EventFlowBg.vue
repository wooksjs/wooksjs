<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()

interface RouteNode {
  x: number
  y: number
}

interface Route {
  id: string
  d: string
  duration: number
  delay: number
  nodes: RouteNode[]
}

const SVG_W = 1200
const SVG_H = 500
const PAD = 12 // padding from SVG edges

function generateRoutes(): Route[] {
  const G = 22 // grid step — all coords snap to multiples of G
  const R = G // arc radius = one grid unit
  const COUNT = 16
  const snap = (v: number) => Math.round(v / G) * G
  const Y_MIN = snap(PAD + R) // account for arc radius extending above
  const Y_MAX = snap(SVG_H - PAD - R * 2) // account for arc radius + node height below

  const routes: Route[] = []

  for (let i = 0; i < COUNT; i++) {
    // Spread base y evenly across the grid
    const baseY = snap(Y_MIN + (i * (Y_MAX - Y_MIN)) / (COUNT - 1))
    let y = snap(Math.max(Y_MIN, Math.min(Y_MAX, baseY)))

    const forkCount = 1 + Math.floor(Math.random() * 2) // 1–2 forks
    const goLeft = i % 5 === 3 // ~20% go right-to-left
    const nodes: RouteNode[] = []
    const parts: string[] = []

    if (!goLeft) {
      parts.push(`M -24 ${y}`)

      const forkXs: number[] = []
      for (let f = 0; f < forkCount; f++) {
        const minX = f === 0 ? snap(SVG_W * 0.1) : forkXs[f - 1] + snap(200)
        const maxX = snap(SVG_W * 0.9) - (forkCount - f - 1) * snap(200)
        if (minX >= maxX) break
        forkXs.push(snap(minX + Math.random() * (maxX - minX)))
      }

      for (let f = 0; f < forkXs.length; f++) {
        const fx = forkXs[f]
        parts.push(`H ${fx}`)

        const down = Math.random() > 0.5
        const dist = snap(48 + Math.floor(Math.random() * 80))
        const targetY = down
          ? snap(Math.min(y + dist, Y_MAX))
          : snap(Math.max(y - dist, Y_MIN))

        if (Math.abs(targetY - y) < R * 2 + G * 2) continue

        nodes.push({ x: fx, y })

        if (down) {
          parts.push(`A ${R} ${R} 0 0 1 ${fx + R} ${y + R}`)
          parts.push(`V ${targetY - R}`)
          parts.push(`A ${R} ${R} 0 0 0 ${fx + R * 2} ${targetY}`)
        } else {
          parts.push(`A ${R} ${R} 0 0 0 ${fx + R} ${y - R}`)
          parts.push(`V ${targetY + R}`)
          parts.push(`A ${R} ${R} 0 0 1 ${fx + R * 2} ${targetY}`)
        }

        y = targetY
        if (Math.random() > 0.5) {
          nodes.push({ x: fx + R * 2, y })
        }
      }

      parts.push(`H ${SVG_W + 24}`)
    } else {
      parts.push(`M ${SVG_W + 24} ${y}`)

      const forkXs: number[] = []
      for (let f = 0; f < forkCount; f++) {
        const maxX = f === 0 ? snap(SVG_W * 0.9) : forkXs[f - 1] - snap(200)
        const minX = snap(SVG_W * 0.1) + (forkCount - f - 1) * snap(200)
        if (minX >= maxX) break
        forkXs.push(snap(minX + Math.random() * (maxX - minX)))
      }

      for (let f = 0; f < forkXs.length; f++) {
        const fx = forkXs[f]
        parts.push(`H ${fx}`)

        const up = Math.random() > 0.5
        const dist = snap(48 + Math.floor(Math.random() * 80))
        const targetY = up
          ? snap(Math.max(y - dist, Y_MIN))
          : snap(Math.min(y + dist, Y_MAX))

        if (Math.abs(targetY - y) < R * 2 + G * 2) continue

        nodes.push({ x: fx, y })

        if (up) {
          parts.push(`A ${R} ${R} 0 0 1 ${fx - R} ${y - R}`)
          parts.push(`V ${targetY + R}`)
          parts.push(`A ${R} ${R} 0 0 0 ${fx - R * 2} ${targetY}`)
        } else {
          parts.push(`A ${R} ${R} 0 0 0 ${fx - R} ${y + R}`)
          parts.push(`V ${targetY - R}`)
          parts.push(`A ${R} ${R} 0 0 1 ${fx - R * 2} ${targetY}`)
        }

        y = targetY
        if (Math.random() > 0.5) {
          nodes.push({ x: fx - R * 2, y })
        }
      }

      parts.push(`H -24`)
    }

    routes.push({
      id: `r${i + 1}`,
      d: parts.join(' '),
      duration: Math.round(40 + Math.random() * 30),
      delay: Math.round(Math.random() * 300) / 10,
      nodes,
    })
  }

  return routes
}

const routes = generateRoutes()

const allNodes = routes.flatMap((r, ri) =>
  r.nodes.map((n) => ({ ...n, routeIndex: ri }))
)

const signalRefs = ref<(SVGPathElement | null)[]>([])
const baseRefs = ref<(SVGPathElement | null)[]>([])
const nodeRefs = ref<(SVGRectElement | null)[]>([])

function setSignalRef(el: any, i: number) {
  signalRefs.value[i] = el as SVGPathElement
}
function setBaseRef(el: any, i: number) {
  baseRefs.value[i] = el as SVGPathElement
}
function setNodeRef(el: any, i: number) {
  nodeRefs.value[i] = el as SVGRectElement
}

function findDistanceAlongPath(
  path: SVGPathElement,
  x: number,
  y: number
): number {
  const totalLen = path.getTotalLength()
  let best = 0
  let bestDist = Infinity
  for (let len = 0; len <= totalLen; len += 5) {
    const pt = path.getPointAtLength(len)
    const dist = (pt.x - x) ** 2 + (pt.y - y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = len
    }
  }
  return best
}

onMounted(() => {
  // Setup signal dash animation
  signalRefs.value.forEach((el) => {
    if (el) {
      const len = el.getTotalLength()
      el.style.setProperty('--path-length', String(len))
      el.style.strokeDasharray = `40 ${len - 40}`
      el.style.strokeDashoffset = String(len)
    }
  })

  // Setup node glow timing
  let flatIndex = 0
  routes.forEach((route, ri) => {
    const pathEl = baseRefs.value[ri]
    if (!pathEl) {
      flatIndex += route.nodes.length
      return
    }
    const totalLen = pathEl.getTotalLength()

    route.nodes.forEach((node) => {
      const nodeEl = nodeRefs.value[flatIndex]
      if (nodeEl) {
        const dist = findDistanceAlongPath(pathEl, node.x, node.y)
        const fraction = dist / totalLen
        const glowDelay = route.delay + fraction * route.duration * 0.03
        nodeEl.style.setProperty('--glow-delay', `${glowDelay}s`)
        nodeEl.style.setProperty('--glow-duration', `${route.duration}s`)
      }
      flatIndex++
    })
  })
})
</script>

<template>
  <div class="event-flow-bg" :class="{ dark: isDark }" aria-hidden="true">
    <svg
      :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
    >
      <g transform="translate(0, -20)">
      <!-- Base route lines -->
      <path
        v-for="(route, i) in routes"
        :key="route.id + '-base'"
        :ref="(el: any) => setBaseRef(el, i)"
        :d="route.d"
        class="route-base"
        stroke-width="1.5"
        stroke-linecap="round"
      />

      <!-- Signal paths (animated traveling dot) -->
      <path
        v-for="(route, i) in routes"
        :key="route.id + '-signal'"
        :ref="(el: any) => setSignalRef(el, i)"
        :d="route.d"
        class="signal-path"
        :style="{
          '--duration': route.duration + 's',
          '--delay': route.delay + 's',
        }"
        stroke-width="2.5"
        stroke-linecap="round"
      />

      <!-- Node blocks at junction points -->
      <rect
        v-for="(node, i) in allNodes"
        :key="'node-' + i"
        :ref="(el: any) => setNodeRef(el, i)"
        :x="node.x - 12"
        :y="node.y - 7"
        width="24"
        height="14"
        rx="4"
        class="node-block"
      />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.event-flow-bg {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
  background: transparent !important;
}

.event-flow-bg svg {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0.15;
  -webkit-mask-image: linear-gradient(
    135deg,
    transparent 0%,
    transparent 15%,
    rgba(0, 0, 0, 0.3) 35%,
    rgba(0, 0, 0, 1) 60%
  );
  mask-image: linear-gradient(
    135deg,
    transparent 0%,
    transparent 15%,
    rgba(0, 0, 0, 0.3) 35%,
    rgba(0, 0, 0, 1) 60%
  );
}

.dark svg {
  opacity: 0.25;
}

/* Route wires */
.route-base {
  stroke: #3d90be;
}

.dark .route-base {
  stroke: #68b7e2;
}

/* Signal traveling along the path */
.signal-path {
  stroke: #1a5a7a;
  stroke-dasharray: 40 2000;
  stroke-dashoffset: 2000;
  animation: signal-travel var(--duration, 8s) linear infinite;
  animation-delay: var(--delay, 0s);
}

.dark .signal-path {
  stroke: #8dd0f0;
}

@keyframes signal-travel {
  0% {
    stroke-dashoffset: var(--path-length, 2000);
    stroke-opacity: 1;
  }
  3% {
    stroke-dashoffset: 0;
    stroke-opacity: 1;
  }
  4% {
    stroke-opacity: 0;
  }
  100% {
    stroke-opacity: 0;
  }
}

/* Node blocks — solid fill, glow synced to signal */
.node-block {
  fill: #3d90be;
  animation: node-glow var(--glow-duration, 8s) linear infinite;
  animation-delay: var(--glow-delay, 0s);
}

.dark .node-block {
  fill: #68b7e2;
  animation-name: node-glow-dark;
}

@keyframes node-glow {
  0% {
    filter: brightness(0.2) drop-shadow(0 0 10px rgba(20, 60, 100, 0.9));
  }
  0.3%,
  100% {
    filter: brightness(1);
  }
}

@keyframes node-glow-dark {
  0% {
    filter: brightness(8) drop-shadow(0 0 8px rgba(104, 183, 226, 0.8));
  }
  0.3%,
  100% {
    filter: brightness(1);
  }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .signal-path {
    animation: none;
    stroke-dasharray: none;
  }
  .node-block {
    animation: none;
  }
}
</style>
