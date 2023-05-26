import { defineConfig, DefaultTheme } from 'vitepress'

const ogDescription = 'Next Generation Event Processing Framework'
const ogImage = 'https://wooksjs.org/og-image.png'
const ogTitle = 'Wooks'
const ogUrl = 'https://wooksjs.org'

// netlify envs
// const deployURL = process.env.DEPLOY_PRIME_URL || ''
// const commitRef = process.env.COMMIT_REF?.slice(0, 8) || 'dev'

export default defineConfig({
    lang: 'en-US',
    title: ' ',
    description: 'Next Generation Event Processing Framework',

    titleTemplate: ':title | Wooks',

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
        logo: '/wooks-full-logo.png', //'/logo.svg',

        search: {
            provider: 'local'
        },

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
            { text: 'Wooks', link: '/wooks/', activeMatch: '/wooks/' },
            { text: 'Web App', link: '/webapp/', activeMatch: '/webapp/' },
            { text: 'CLI App', link: '/cliapp/', activeMatch: '/cliapp/' },
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
                                link: 'https://github.com/wooksjs/wooksjs/blob/main/CHANGELOG.md',
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
            '/wooks/': [
                {
                    text: 'Wooks',
                    items: [
                        {
                            text: 'Why Wooks',
                            link: '/wooks/why',
                        },
                        {
                            text: 'Introduction',
                            link: '/wooks/',
                        },
                        {
                            text: 'Advanced',
                            // collapsible: true,
                            collapsed: false,
                            items: [
                                {
                                    text: 'Event Context',
                                    link: '/wooks/advanced/context',
                                },
                                {
                                    text: 'Logging in Wooks',
                                    link: '/wooks/advanced/logging',
                                },
                            ],
                        }      
                    ],
                },
            ],
            '/webapp/': [
                {
                    text: 'Web Application',
                    items: [
                        {
                            text: 'Introduction',
                            link: '/webapp/introduction',
                        },
                        {
                            text: 'Quick Start',
                            link: '/webapp/',
                        },
                        {
                            text: 'Routing',
                            link: '/webapp/routing',
                        },
                        {
                            text: 'Composables',
                            collapsed: false,
                            link: '/webapp/composables/',
                            items: [
                                {
                                    text: 'Request',
                                    link: '/webapp/composables/request',
                                },
                                {
                                    text: 'Response',
                                    link: '/webapp/composables/response',
                                },
                                {
                                    text: 'Body Parser',
                                    link: '/webapp/body',
                                },
                                {
                                    text: 'Proxy Requests',
                                    link: '/webapp/proxy',
                                },
                                {
                                    text: 'Serve Static',
                                    link: '/webapp/static',
                                },
                            ],
                        },
                        {
                            text: 'Advanced',
                            collapsed: true,
                            items: [
                                {
                                    text: 'Context and Hooks',
                                    link: '/webapp/more-hooks',
                                },
                                {
                                    text: 'Create an Adapter',
                                    link: '/webapp/adapters',
                                },
                            ],
                        },
                        {
                            text: 'Adapters',
                            collapsed: true,
                            items: [
                                {
                                    text: 'Express Adapter',
                                    link: '/webapp/express',
                                },
                            ]
                        },
                        {
                            text: 'Logging in Wooks',
                            link: '/wooks/advanced/logging',
                        },
                    ]
                }],
            '/cliapp/': [
                {
                    text: 'CLI Application',
                    items: [
                        {
                            text: 'Introduction',
                            link: '/cliapp/introduction',
                        },
                        {
                            text: 'Quick Start',
                            link: '/cliapp/',
                        },
                        {
                            text: 'Routing',
                            link: '/cliapp/routing',
                        },
                        {
                            text: 'Command Options',
                            link: '/cliapp/options',
                        },
                        {
                            text: 'Command Usage (Help)',
                            link: '/cliapp/cli-help',
                        },
                        {
                            text: 'Logging in Wooks',
                            link: '/wooks/advanced/logging',
                        },
                    ]
                }],
                // {
                //     text: 'APIs',
                //     items: [
                //         {
                //             text: 'Plugin API',
                //             link: '/guide/api-plugin',
                //         },
                //     ],
                // },
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
