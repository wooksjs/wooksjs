<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const props = withDefaults(
  defineProps<{
    title?: string
    /**
     * Data: { 'ProstoRouter': { '22': 8600, '50': 7562, ... }, ... }
     * Framework → { routeCount: value }
     */
    data: Record<string, Record<string, number>>
    /** X-axis labels (route counts). Auto-detected from data if not provided. */
    labels?: string[]
    unit?: string
    height?: number
  }>(),
  {
    unit: 'ops/ms',
    height: 360,
  },
)

const frameworkColors: Record<string, string> = {
  ProstoRouter: '#3d90be',
  FindMyWay: '#444444',
  Rou3: '#00b860',
  'Hono (RegExpRouter)': '#e36002',
  'Hono (TrieRouter)': '#c44e00',
  Express: '#888888',
  Wooks: '#3d90be',
  Fastify: '#444444',
  h3: '#00b860',
  Hono: '#e36002',
}

const frameworkColorsDark: Record<string, string> = {
  ProstoRouter: '#5bb8e8',
  FindMyWay: '#aaaaaa',
  Rou3: '#34d68a',
  'Hono (RegExpRouter)': '#ff8533',
  'Hono (TrieRouter)': '#cc6622',
  Express: '#999999',
  Wooks: '#5bb8e8',
  Fastify: '#aaaaaa',
  h3: '#34d68a',
  Hono: '#ff8533',
}

const isDark = ref(false)

function detectDark() {
  if (typeof document !== 'undefined') {
    isDark.value = document.documentElement.classList.contains('dark')
  }
}

onMounted(() => {
  detectDark()
  const observer = new MutationObserver(detectDark)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

const xLabels = computed(() => {
  if (props.labels) return props.labels
  const allKeys = new Set<string>()
  for (const fw of Object.values(props.data)) {
    for (const k of Object.keys(fw)) allKeys.add(k)
  }
  return [...allKeys].sort((a, b) => Number(a) - Number(b))
})

const frameworks = computed(() => Object.keys(props.data))

const datasets = computed(() =>
  frameworks.value.map((fw) => {
    const colors = isDark.value ? frameworkColorsDark : frameworkColors
    const color = colors[fw] ?? '#666666'
    const fwData = props.data[fw]
    return {
      label: fw,
      data: xLabels.value.map((x) => fwData[x] ?? null),
      borderColor: color,
      backgroundColor: color,
      pointBackgroundColor: color,
      pointBorderColor: color,
      pointRadius: 5,
      pointHoverRadius: 7,
      borderWidth: 3,
      tension: 0.2,
      spanGaps: false,
    }
  }),
)

const textColor = computed(() => (isDark.value ? '#d1d5db' : '#374151'))
const gridColor = computed(() => (isDark.value ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'))

const chartData = computed(() => ({
  labels: xLabels.value,
  datasets: datasets.value,
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top' as const,
      labels: {
        color: textColor.value,
        padding: 16,
        usePointStyle: true,
        pointStyle: 'circle',
        font: { size: 12 },
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: any) => {
          const v = ctx.raw as number | null
          if (v === null) return `${ctx.dataset.label}: N/A`
          return `${ctx.dataset.label}: ${v.toLocaleString()} ${props.unit}`
        },
      },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Number of routes',
        color: textColor.value,
        font: { size: 12 },
      },
      ticks: {
        color: textColor.value,
        font: { size: 12 },
      },
      grid: { color: gridColor.value },
    },
    y: {
      title: {
        display: true,
        text: props.unit,
        color: textColor.value,
        font: { size: 12 },
      },
      ticks: {
        color: textColor.value,
        callback: (v: any) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v),
        font: { size: 11 },
      },
      grid: { color: gridColor.value },
    },
  },
}))

const chartKey = computed(() => `scaling-${isDark.value}`)
</script>

<template>
  <div class="scaling-chart">
    <h4 v-if="title" class="scaling-chart-title">{{ title }}</h4>
    <div class="scaling-chart-container" :style="{ height: height + 'px' }">
      <Line :key="chartKey" :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.scaling-chart {
  margin: 1.5rem 0;
}

.scaling-chart-title {
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.scaling-chart-container {
  position: relative;
  width: 100%;
}
</style>
