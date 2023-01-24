import { defineConfig, DefaultTheme } from 'vitepress'

const ogDescription = 'Next Generation Event Processing Framework'
const ogImage = 'https://wooksjs.org/og-image.png'
const ogTitle = 'Wooks'
const ogUrl = 'https://wooksjs.org'

// netlify envs
// const deployURL = process.env.DEPLOY_PRIME_URL || ''
// const commitRef = process.env.COMMIT_REF?.slice(0, 8) || 'dev'

export default defineConfig({
    title: `Wooks`,
    description: 'Next Generation Event Processing Framework',

    head: [
        ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:title', content: ogTitle }],
        ['meta', { property: 'og:image', content: ogImage }],
        ['meta', { property: 'og:url', content: ogUrl }],
        ['meta', { property: 'og:description', content: ogDescription }],
        ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
        ['meta', { name: 'twitter:site', content: '@wooksjs' }],
        ['meta', { name: 'theme-color', content: '#3D90BE' }],
    ],

    vue: {
        reactivityTransform: true,
    },

    themeConfig: {
        logo: '/logo.svg',

        editLink: {
            pattern: 'https://github.com/wooksjs/wooksjs/edit/main/docs/:path',
            text: 'Suggest changes to this page',
        },

        socialLinks: [
            // { icon: 'twitter', link: 'https://twitter.com/wooksjs' },
            //   { icon: 'discord', link: 'https://chat.wooksjs.dev' },
            { icon: 'github', link: 'https://github.com/wooksjs/wooksjs' },
        ],

        footer: {
            message: `Released under the MIT License.`,
            copyright: 'Copyright © 2023-present Artem Maltsev',
        },

        nav: [
            { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
            // { text: 'Config', link: '/config/', activeMatch: '/config/' },
            // { text: 'Plugins', link: '/plugins/', activeMatch: '/plugins/' },
            {
                text: 'Resources',
                items: [
                    { text: 'Team', link: '/team' },
                    {
                        items: [
                            // {
                            //     text: 'Twitter',
                            //     link: 'https://twitter.com/wooksjs',
                            // },
                            //   {
                            //     text: 'Discord Chat',
                            //     link: 'https://chat.wooksjs.dev',
                            //   },
                            //   {
                            //     text: 'DEV Community',
                            //     link: 'https://dev.to/t/wooksjs',
                            //   },
                            {
                                text: 'Changelog',
                                link: 'https://github.com/wooksjs/wooksjs/blob/main/packages/wooks/CHANGELOG.md',
                            },
                        ],
                    },
                ],
            },
            //   {
            //     text: 'Version',
            //     items: versionLinks,
            //   },
        ],

        sidebar: {
            '/guide/': [
                {
                    text: 'Guide',
                    items: [
                        {
                            text: 'Why Wooks',
                            link: '/guide/why',
                        },
                        {
                            text: 'Getting Started',
                            link: '/guide/',
                        },
                        {
                            text: 'Wooks HTTP',
                            link: '/guide/http',
                            items: [
                                {
                                    text: 'Request',
                                    link: '/guide/http/request',
                                },
                                {
                                    text: 'Response',
                                    link: '/guide/http/response',
                                },
                                {
                                    text: 'Body Parser',
                                    link: '/guide/http/body',
                                },
                                {
                                    text: 'Proxy Requests',
                                    link: '/guide/http/proxy',
                                },
                                {
                                    text: 'Serve Static',
                                    link: '/guide/http/static',
                                },
                            ]
                        },
                        // {
                        //     text: 'Features',
                        //     link: '/guide/features',
                        // },
                        // {
                        //   text: 'CLI',
                        //   link: '/guide/cli',
                        // },
                    ],
                },
                // {
                //     text: 'APIs',
                //     items: [
                //         {
                //             text: 'Plugin API',
                //             link: '/guide/api-plugin',
                //         },
                //     ],
                // },
            ],
            // '/config/': [
            //     {
            //         text: 'Config',
            //         items: [
            //             {
            //                 text: 'Configuring Wooks',
            //                 link: '/config/',
            //             },
            //         ],
            //     },
            // ],
        },
    },
})