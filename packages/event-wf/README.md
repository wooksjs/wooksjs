# @wooksjs/event-wf

**!!! This is work-in-progress library, breaking changes are expected !!!**

<p align="center">
<img src="../../wooks-logo.png" width="450px"><br>
<a  href="https://github.com/wooksjs/wooksjs/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</a>
</p>

The `@wooksjs/event-wf` is a component of the `wooks` event processing framework built on top of [@prostojs/wf](https://github.com/prostojs/wf). It provides a way to manage complex workflows and processes using the underlying workflow engine.

The primary features of `@wooksjs/event-wf` include:

- Support for conditional workflow branching based on dynamic conditions.
- Support for parametric steps and workflows.
- Support for user input requirements and interaction during the workflows.

## Installation

To install `@wooksjs/event-wf`, you can use npm:

```sh
npm install wooks @wooksjs/event-wf
```

## Quick Start

```js
import { useRouteParams } from '@wooksjs/event-core'
import { createWfApp } from '@wooksjs/event-wf'

const app = createWfApp<{ result: number }>()

app.step('add', {
    input: 'number',
    handler: 'ctx.result += input',
})

app.step('add/:n', {
    handler: (ctx) => {
        ctx.result += Number(useRouteParams().get('n'))
    },
})

app.flow('adding', [
    { id: 'add', input: 5 },
    { id: 'add', input: 2 },
    {
        condition: 'result < 10',
        steps: [{ id: 'add', input: 3 }, { id: 'add', input: 4 }],
    },
])

app.flow('adding-parametric', [
    'add/5',
    'add/2',
    {
        condition: 'result < 10',
        steps: ['add/3', 'add/4'],
    },
])

app.run()

// Run the 'adding' workflow
app.start('adding', { result: 0 })
```

## Documentation

For more detailed documentation, please visit [wooks.moost.org](https://wooks.moost.org/wf/).

## Contributing

Contributions to the `@wooksjs/event-wf` project are welcome. If you find any bugs or have a feature request, please open an issue on [the GitHub repository](https://github.com/wooksjs/wooksjs).

## License

`@wooksjs/event-wf` is licensed under the [MIT license](https://github.com/wooksjs/wooksjs/blob/main/LICENSE).
