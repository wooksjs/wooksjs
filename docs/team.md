---
layout: page
title: Meet the Team
description: The development of Wooks is guided by a single software engineer.
---

<script setup>
import {
  VPTeamPage,
  VPTeamPageTitle,
  VPTeamPageSection,
  VPTeamMembers
} from 'vitepress/theme'
const core = [{
    avatar: 'https://www.github.com/mav-rik.png',
    name: 'Artem Maltsev',
    title: 'Creator',
    // org: 'Booking.com',
    // orgLink: '',
    desc: 'Fullstack Software Engineer',
    links: [
      { icon: 'github', link: 'https://github.com/mav-rik' },
      { icon: 'twitter', link: 'https://twitter.com/MAVrik7' },
    ],
    // sponsor: 'https://github.com/sponsors/mav-rik',
  }]
</script>

<VPTeamPage>
  <VPTeamPageTitle>
    <template #title>Meet the Team</template>
    <template #lead>
      The development of Wooks is driven by a single software developer.
    </template>
  </VPTeamPageTitle>
  <VPTeamMembers :members="core" />
</VPTeamPage>
