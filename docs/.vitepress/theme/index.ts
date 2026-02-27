import DefaultTheme from 'vitepress/theme'
import HomeLayout from './HomeLayout.vue'
import { defineAsyncComponent } from 'vue'
import type { Theme } from 'vitepress'
import './custom.css'

export default {
    ...DefaultTheme,
    Layout: HomeLayout,
    enhanceApp({ app }) {
        app.component(
            'BenchmarkBars',
            defineAsyncComponent(() => import('./BenchmarkBars.vue')),
        )
        app.component(
            'BenchmarkChart',
            defineAsyncComponent(() => import('./BenchmarkChart.vue')),
        )
        app.component(
            'ScalingChart',
            defineAsyncComponent(() => import('./ScalingChart.vue')),
        )
    },
} satisfies Theme
