<script setup>
import DefaultTheme from 'vitepress/theme'
import VPButton from 'vitepress/dist/client/theme-default/components/VPButton.vue'

const { Layout } = DefaultTheme
const actions = [
    { theme: 'brand', text: 'Get Started with Web App', link: '/webapp/' },
    { theme: 'alt', text: 'What is Wooks?', link: '/wooks/what' },
    {
        theme: 'alt',
        text: 'View on GitHub',
        link: 'https://github.com/wooksjs/wooksjs',
    },
]
</script>

<template>
    <Layout>
        <template #home-hero-before>
            <div class="VPHero">
                <div
                    class="container"
                    style="display: flex; flex-direction: column"
                >
                    <div class="hero-bg" />
                    <div class="main">
                        <img
                            src="/wooks-full-logo.png"
                            alt="Wooks"
                            style="width: 400px; margin-bottom: 32px"
                        />
                        <p class="text">Next Generation Event Processing Framework</p>
                        <p class="tagline">Get ready for hooks in web apps.</p>

                        <div v-if="actions" class="actions">
                            <div
                                v-for="action in actions"
                                :key="action.link"
                                class="action"
                            >
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
        </template>
    </Layout>
</template>

<style scoped>
.VPHero {
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

/* Create an overlay div with the "screen" blending mode */
.hero-bg {
  background-image: url(/hero-bg.png);
  display: block;
  width: 100%;
  height: 100%;
  position: absolute;
  background-size: cover;
  background-position: center;
  opacity: 0.7;
  mix-blend-mode: difference;
}

.dark .hero-bg {
  mix-blend-mode: screen;    
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
.VPHero.has-image .container {
    text-align: center;
}
@media (min-width: 960px) {
    .VPHero.has-image .container {
        text-align: left;
    }
}
@media (min-width: 960px) {
    .main {
        order: 1;
        width: 100%;
        /* width: calc((100% / 3) * 2); */
    }
    .VPHero.has-image .main {
        /* max-width: 592px; */
        max-width: 100%;
        width: 100%;
    }
}
.name,
.text {
    /* max-width: 392px; */
    letter-spacing: -0.4px;
    line-height: 40px;
    font-size: 32px;
    font-weight: 700;
    white-space: pre-wrap;
}
.VPHero.has-image .name,
.VPHero.has-image .text {
    margin: 0 auto;
}
.name {
    color: var(--vp-home-hero-name-color);
}
.clip {
    background: var(--vp-home-hero-name-background);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: var(--vp-home-hero-name-color);
}
@media (min-width: 640px) {
    .name,
    .text {
        /* max-width: 576px; */
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
    .VPHero.has-image .name,
    .VPHero.has-image .text {
        margin: 0;
    }
}
.tagline {
    padding-top: 8px;
    max-width: 392px;
    line-height: 28px;
    font-size: 18px;
    font-weight: 500;
    white-space: pre-wrap;
    color: var(--vp-c-text-2);
}
.VPHero.has-image .tagline {
    margin: 0 auto;
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
    .VPHero.has-image .tagline {
        margin: 0;
    }
}
.actions {
    display: flex;
    flex-wrap: wrap;
    margin: -6px;
    padding-top: 24px;
}
.VPHero.has-image .actions {
    justify-content: center;
}
@media (min-width: 640px) {
    .actions {
        padding-top: 32px;
    }
}
@media (min-width: 960px) {
    .VPHero.has-image .actions {
        justify-content: flex-start;
    }
}
.action {
    flex-shrink: 0;
    padding: 6px;
}
.image {
    order: 1;
    margin: -76px -24px -48px;
}
@media (min-width: 640px) {
    .image {
        margin: -108px -24px -48px;
    }
}
@media (min-width: 960px) {
    .image {
        flex-grow: 1;
        order: 2;
        margin: 0;
        min-height: 100%;
    }
}
.image-container {
    position: relative;
    margin: 0 auto;
    width: 320px;
    height: 320px;
}
@media (min-width: 640px) {
    .image-container {
        width: 392px;
        height: 392px;
    }
}
@media (min-width: 960px) {
    .image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100%;
        /*rtl:ignore*/
        transform: translate(-32px, -32px);
    }
}
.image-bg {
    position: absolute;
    top: 50%;
    /*rtl:ignore*/
    left: 50%;
    border-radius: 50%;
    width: 192px;
    height: 192px;
    background-image: var(--vp-home-hero-image-background-image);
    filter: var(--vp-home-hero-image-filter);
    /*rtl:ignore*/
    transform: translate(-50%, -50%);
}
@media (min-width: 640px) {
    .image-bg {
        width: 256px;
        height: 256px;
    }
}
@media (min-width: 960px) {
    .image-bg {
        width: 320px;
        height: 320px;
    }
}
:deep(.image-src) {
    position: absolute;
    top: 50%;
    /*rtl:ignore*/
    left: 50%;
    max-width: 192px;
    /*rtl:ignore*/
    transform: translate(-50%, -50%);
}
@media (min-width: 640px) {
    :deep(.image-src) {
        max-width: 256px;
    }
}
@media (min-width: 960px) {
    :deep(.image-src) {
        max-width: 320px;
    }
}
</style>
