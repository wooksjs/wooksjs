<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute } from 'vitepress'
import SnippetExpress from './snippets/compare-express.md'
import SnippetWooks from './snippets/compare-wooks.md'
import SnippetHttp from './snippets/http.md'
import SnippetWs from './snippets/ws.md'
import SnippetCli from './snippets/cli.md'
import SnippetWf from './snippets/wf.md'
import EventFlowBg from './EventFlowBg.vue'

const { Layout } = DefaultTheme

const actions = [
    { theme: 'brand', text: 'Get Started', link: '/wooks/' },
    { theme: 'alt', text: 'Why Wooks?', link: '/wooks/why' },
    {
        theme: 'alt',
        text: 'View on GitHub',
        link: 'https://github.com/wooksjs/wooksjs',
    },
]

const activeTab = ref('http')
const tiltDeg = ref(2)

function switchTab(id: string) {
    activeTab.value = id
    // Random tilt between -3 and 3, but at least 1.5 degrees magnitude
    const sign = Math.random() > 0.5 ? 1 : -1
    tiltDeg.value = sign * (1.5 + Math.random() * 1.5)
}

const backCardStyle = computed(() => ({
    transform: `rotate(${tiltDeg.value}deg)`,
}))

const tabs = [
    { id: 'http', label: 'HTTP', link: '/webapp/' },
    { id: 'ws', label: 'WebSocket', link: '/wsapp/' },
    { id: 'cli', label: 'CLI', link: '/cliapp/' },
    { id: 'wf', label: 'Workflows', link: '/wf/' },
]

const activeLink = computed(() => tabs.find((t) => t.id === activeTab.value)?.link ?? '/')

const features = [
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`,
        title: 'Typed Event Context',
        details: 'Every event gets a typed, extensible state — not ad-hoc properties on req. Declare slots, compute lazily, cache automatically.',
        link: '/wooks/what',
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H4.2"/></svg>`,
        title: 'One API. Every event type.',
        details: 'HTTP, WebSocket, CLI, Workflows — the same composable pattern works everywhere. Learn once, use anywhere.',
        link: '/wooks/',
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
        title: 'Lazy by default',
        details: 'Body parsing, cookie reading, auth extraction — nothing runs until you call it. Auth fails with a 100KB body? Wooks rejects 3.5× faster.',
        link: '/wooks/why',
    },
    {
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6.49999H7.5M12 6.49999H7.5M7.5 6.49999V18M21 7.49999C16.5 3 10.3027 10.8181 17 12C25 13.4118 20.5 20.5 14 17" stroke-width="1.5" stroke-linecap="round" stroke="currentColor"/></svg>`,
        title: 'TypeScript-first',
        details: 'Fully typed context slots, route params, and composable return values. Type safety through compile-time branding.',
        link: '/wooks/type-safety',
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
        title: 'Advanced Router',
        details: 'Regex constraints, multi-wildcards, optional params. Fastest on enterprise-grade route patterns — ahead of Hono, Fastify, and h3.',
        link: '/benchmarks/router',
    },
    {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
        title: 'Build your own composables',
        details: 'defineWook() lets you create reusable, cached, typed composables — like building your own useAuth().',
        link: '/wooks/what#definewook',
    },
]

const route = useRoute()

function setupScrollAnimations() {
    nextTick(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) {
                        e.target.classList.add('visible')
                        observer.unobserve(e.target)
                    }
                })
            },
            { threshold: 0.1 }
        )
        document.querySelectorAll('.animate-in').forEach((el) => {
            el.classList.remove('visible')
            observer.observe(el)
        })
    })
}

onMounted(setupScrollAnimations)
watch(() => route.path, setupScrollAnimations)
</script>

<template>
    <Layout>
        <template #home-hero-before>
            <!-- Hero -->
            <div class="VPHero">
                <div class="container" style="display: flex; flex-direction: column">
                    <EventFlowBg />
                    <div class="main">
                        <img
                            src="/wooks-full-logo.svg"
                            alt="Wooks"
                            style="width: 400px; margin-bottom: 24px"
                        />
                        <p class="text">Composables for Node.js</p>
                        <p class="tagline">
                            Type-safe event context. Lazy by design.
                        </p>

                        <div v-if="actions" class="actions">
                            <div v-for="action in actions" :key="action.link" class="action">
                                <VPButton
                                    tag="a"
                                    size="medium"
                                    :theme="action.theme"
                                    :text="action.text"
                                    :href="action.link"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Feature Tiles -->
            <section class="code-section" style="padding-top: 0; padding-bottom: 0;">
                <div class="code-section-inner">
                    <div class="features-grid">
                        <a
                            v-for="(f, i) in features"
                            :key="i"
                            :href="f.link"
                            class="feature-card"
                            :style="{ '--delay': `${i * 0.07}s` }"
                        >
                            <div class="feature-icon" v-html="f.icon" />
                            <div class="feature-body">
                                <h3 class="feature-title">{{ f.title }}</h3>
                                <p class="feature-details">{{ f.details }}</p>
                            </div>
                        </a>
                    </div>
                </div>
            </section>

            <!-- Before/After Code Comparison -->
            <section class="code-section">
                <div class="code-section-inner animate-in">
                    <h2 class="section-heading">See it in practice.</h2>
                    <div class="comparison-grid">
                        <div class="comparison-col">
                            <div class="comparison-label express-label">Express</div>
                            <div class="comparison-block">
                                <SnippetExpress />
                            </div>
                        </div>
                        <div class="comparison-arrow">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M5 12h14M13 5l7 7-7 7" />
                            </svg>
                        </div>
                        <div class="comparison-col">
                            <div class="comparison-label wooks-label">Wooks</div>
                            <div class="comparison-block">
                                <SnippetWooks />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Performance Strip -->
            <section class="perf-strip animate-in">
                <div class="perf-strip-inner">
                    <div class="perf-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    </div>
                    <div class="perf-content">
                        <div class="perf-number">70,332 <span class="perf-unit">req/s</span></div>
                        <div class="perf-text">21-route SaaS benchmark — fastest overall, 10–15% ahead on cookie-heavy traffic.</div>
                    </div>
                    <a href="/benchmarks/wooks-http" class="perf-link">See benchmarks &rarr;</a>
                </div>
            </section>

            <!-- Tabbed Adapter Showcase -->
            <section class="code-section showcase-section animate-in">
                <div class="code-section-inner">
                    <h2 class="section-heading" style="text-align: center">One pattern. Every event type.</h2>
                    <p class="showcase-subheading">
                        HTTP, WebSocket, CLI, Workflows — the same composable API everywhere. Learn once, use anywhere.
                    </p>

                    <div class="tab-bar">
                        <button
                            v-for="tab in tabs"
                            :key="tab.id"
                            :class="['tab-btn', { active: activeTab === tab.id }]"
                            @click="switchTab(tab.id)"
                        >
                            {{ tab.label }}
                        </button>
                    </div>

                    <div class="tab-stack">
                        <div class="tab-back-card" :style="backCardStyle" />
                        <a :href="activeLink" class="try-it-btn">Try it &rarr;</a>
                        <div class="tab-content">
                            <SnippetHttp v-show="activeTab === 'http'" />
                            <SnippetWs v-show="activeTab === 'ws'" />
                            <SnippetCli v-show="activeTab === 'cli'" />
                            <SnippetWf v-show="activeTab === 'wf'" />
                        </div>
                    </div>
                </div>
            </section>
        </template>
    </Layout>
</template>

<style scoped>
/* ---- Hero ---- */
.VPHero {
    position: relative;
    margin-top: calc(
        (var(--vp-nav-height) + var(--vp-layout-top-height, 0px)) * -1
    );
    padding: calc(
            var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 48px
        )
        24px 48px;
}
@media (min-width: 640px) {
    .VPHero {
        padding: calc(
                var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px
            )
            48px 64px;
    }
}
@media (min-width: 960px) {
    .VPHero {
        padding: calc(
                var(--vp-nav-height) + var(--vp-layout-top-height, 0px) + 64px
            )
            64px 64px;
    }
}
.container {
    display: flex;
    flex-direction: column;
    margin: 0 auto;
    max-width: 1152px;
    position: relative;
}
@media (min-width: 960px) {
    .container {
        flex-direction: row;
    }
}
.main {
    position: relative;
    z-index: 10;
    order: 2;
    flex-grow: 1;
    flex-shrink: 0;
}
@media (min-width: 960px) {
    .main {
        order: 1;
        width: 100%;
    }
}
.name,
.text {
    letter-spacing: -0.4px;
    line-height: 40px;
    font-size: 32px;
    font-weight: 700;
    white-space: pre-wrap;
}
.name {
    color: var(--vp-home-hero-name-color);
}
@media (min-width: 640px) {
    .name,
    .text {
        line-height: 56px;
        font-size: 48px;
    }
}
@media (min-width: 960px) {
    .name,
    .text {
        line-height: 64px;
        font-size: 56px;
    }
}
.tagline {
    padding-top: 8px;
    max-width: 560px;
    line-height: 28px;
    font-size: 18px;
    font-weight: 500;
    white-space: pre-wrap;
    color: var(--vp-c-text-2);
}
@media (min-width: 640px) {
    .tagline {
        padding-top: 12px;
        max-width: 576px;
        line-height: 32px;
        font-size: 20px;
    }
}
@media (min-width: 960px) {
    .tagline {
        line-height: 36px;
        font-size: 24px;
    }
}
.actions {
    display: flex;
    flex-wrap: wrap;
    margin: -6px;
    padding-top: 24px;
}
@media (min-width: 640px) {
    .actions {
        padding-top: 32px;
    }
}
.action {
    flex-shrink: 0;
    padding: 6px;
}

/* ---- Shared Code Sections (tinted full-bleed) ---- */
.code-section {
    padding: 32px 24px;
    position: relative;
}
.showcase-section {
    min-height: 775px;
    background: #f2f7fa;
}
:global(.dark) .showcase-section, .dark .showcase-section {
    background: #052c41;
}
@media (min-width: 640px) {
    .code-section {
        padding: 64px 48px;
    }
}
@media (min-width: 960px) {
    .code-section {
        padding: 64px 64px;
    }
}
.code-section-inner {
    max-width: 1152px;
    margin: 0 auto;
}
.section-heading {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 20px;
    color: var(--vp-c-text-1);
}
@media (min-width: 640px) {
    .section-heading {
        font-size: 28px;
    }
}

/* ---- Code Comparison ---- */
.comparison-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    align-items: stretch;
    min-width: 0;
}
.comparison-col {
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.comparison-col .comparison-block {
    flex: 1;
}
.comparison-arrow {
    display: flex;
    justify-content: center;
    align-self: center;
    color: var(--vp-c-text-3);
}
.comparison-arrow svg {
    transform: rotate(90deg);
}
@media (min-width: 768px) {
    .comparison-grid {
        grid-template-columns: 1fr auto 1fr;
        gap: 16px;
    }
    .comparison-arrow svg {
        transform: rotate(0deg);
    }
}
.comparison-block {
    border-radius: 0 0 12px 12px;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--vp-c-divider);
    border-top: none;
    background: var(--vp-code-block-bg);
}
.comparison-label {
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border-radius: 12px 12px 0 0;
    border: 1px solid var(--vp-c-divider);
    border-bottom: none;
}
.express-label {
    background: rgba(128, 128, 128, 0.1);
    color: var(--vp-c-text-2);
}
.wooks-label {
    background: rgba(61, 144, 190, 0.15);
    color: var(--vp-c-brand);
}
/* Shared: reset VitePress code block chrome inside custom containers */
.comparison-block :deep(div[class*="language-"]),
.tab-content :deep(div[class*="language-"]) {
    margin: 0;
    border-radius: 0;
}
.comparison-block :deep(button.copy),
.comparison-block :deep(span.lang),
.tab-content :deep(button.copy),
.tab-content :deep(span.lang) {
    display: none;
}
.comparison-block :deep(pre),
.tab-content :deep(pre) {
    padding: 0 !important;
}

/* ---- Adapter Showcase ---- */
.showcase-subheading {
    font-size: 16px;
    color: var(--vp-c-text-2);
    text-align: center;
    margin-top: -12px;
    margin-bottom: 24px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
}
.tab-bar {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin-bottom: 24px;
    flex-wrap: wrap;
}
.tab-btn {
    padding: 8px 20px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-2);
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;
}
.tab-btn:hover {
    color: var(--vp-c-text-1);
    border-color: var(--vp-c-brand);
}
.tab-btn.active {
    background: var(--vp-c-brand);
    color: #fff;
    border-color: var(--vp-c-brand);
}
.tab-stack {
    position: relative;
}
.tab-back-card {
    position: absolute;
    inset: 4px -2px -4px 2px;
    border-radius: 12px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-code-block-bg);
    opacity: 0.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.dark .tab-back-card {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.tab-content {
    position: relative;
    border-radius: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-code-block-bg);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
}
.dark .tab-content {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
}
.try-it-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    padding: 4px 14px;
    font-size: 13px;
    font-weight: 500;
    color: #00000078;
    background: var(--vp-code-block-bg);
    border: 1px solid var(--vp-c-divider);
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.2s;
}
html.dark .try-it-btn {
    color: #ffffff78;
}
.try-it-btn:hover {
    color: var(--vp-c-brand);
    border-color: var(--vp-c-brand);
}
.comparison-block :deep(code),
.tab-content :deep(code) {
    display: block;
    width: fit-content;
    min-width: 100%;
    padding: 0 20px;
}

/* ---- Feature Tiles ---- */
.features-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
}
@media (min-width: 640px) {
    .features-grid {
        grid-template-columns: 1fr 1fr;
    }
}
@media (min-width: 960px) {
    .features-grid {
        grid-template-columns: 1fr 1fr 1fr;
    }
}
.feature-card {
    display: flex;
    gap: 16px;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
    text-decoration: none;
    color: inherit;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.25s ease,
                border-color 0.25s ease;
    animation: feature-fade-in 0.5s ease both;
    animation-delay: var(--delay);
}
.feature-card:hover {
    transform: translateY(-4px);
    border-color: var(--vp-c-brand);
    box-shadow: 0 8px 24px rgba(61, 144, 190, 0.12);
}
.dark .feature-card:hover {
    box-shadow: 0 8px 24px rgba(61, 144, 190, 0.2);
}
@keyframes feature-fade-in {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
.feature-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 6px;
    border-radius: 8px;
    background: rgba(61, 144, 190, 0.1);
    color: var(--vp-c-brand);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                background 0.25s ease;
}
.feature-card:hover .feature-icon {
    transform: scale(1.15) rotate(-5deg);
    background: rgba(61, 144, 190, 0.18);
}
.feature-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
.feature-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--vp-c-text-1);
    margin-bottom: 4px;
    line-height: 1.4;
}
.feature-details {
    font-size: 13px;
    color: var(--vp-c-text-2);
    line-height: 1.5;
    margin: 0;
}

/* ---- Performance Strip ---- */
.perf-strip {
    padding: 8px 24px 40px;
}
.perf-strip-inner {
    max-width: 800px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 28px 32px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(61, 144, 190, 0.08) 0%, rgba(61, 144, 190, 0.03) 100%);
    border: 1px solid rgba(61, 144, 190, 0.2);
}
:global(.dark) .perf-strip-inner {
    background: linear-gradient(135deg, rgba(61, 144, 190, 0.15) 0%, rgba(61, 144, 190, 0.05) 100%);
    border-color: rgba(61, 144, 190, 0.25);
}
.perf-icon {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    padding: 8px;
    border-radius: 12px;
    background: rgba(61, 144, 190, 0.12);
    color: var(--vp-c-brand);
}
:global(.dark) .perf-icon {
    background: rgba(61, 144, 190, 0.2);
}
.perf-icon svg {
    width: 100%;
    height: 100%;
}
.perf-content {
    flex: 1;
    min-width: 0;
}
.perf-number {
    font-size: 36px;
    font-weight: 800;
    color: var(--vp-c-brand);
    letter-spacing: -1px;
    line-height: 1.1;
}
.perf-unit {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0;
}
.perf-text {
    font-size: 14px;
    color: var(--vp-c-text-2);
    line-height: 1.5;
    margin-top: 4px;
}
.perf-link {
    flex-shrink: 0;
    padding: 8px 20px;
    font-size: 14px;
    font-weight: 500;
    color: var(--vp-c-brand);
    text-decoration: none;
    white-space: nowrap;
    border: 1px solid rgba(61, 144, 190, 0.3);
    border-radius: 8px;
    transition: all 0.2s;
}
.perf-link:hover {
    background: rgba(61, 144, 190, 0.08);
    border-color: var(--vp-c-brand);
}
@media (max-width: 639px) {
    .perf-strip-inner {
        flex-direction: column;
        text-align: center;
        padding: 24px 20px;
    }
    .perf-number {
        font-size: 32px;
    }
}
@media (min-width: 640px) {
    .perf-strip {
        padding: 8px 48px 48px;
    }
    .perf-number {
        font-size: 40px;
    }
}

/* ---- Scroll-reveal animation ---- */
.animate-in {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
}
.animate-in.visible {
    opacity: 1;
    transform: translateY(0);
}
</style>
