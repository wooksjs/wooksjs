# Introduction into Wooks CLI
<span class="cli-header"><span class="cli-path">/guide</span><span class="cli-invite">$</span> wooks cli --introduction<span class="cli-blink">|</span></span>

The Wooks CLI adapter, `@wooksjs/event-cli`, is a package that provides functionality to process command-line interface (CLI)
commands using the Wooks framework. It leverages the concept of composables and event context to handle the CLI command processing workflow.

## Wooks Concept

Wooks is a framework that allows you to build modular and scalable applications by composing functionalities called "composables".
Composables are reusable units of code that encapsulate specific functionality and can be combined to create complex applications.

In the context of CLI command processing, Wooks extends its capabilities to handle command events using the `@wooksjs/event-cli` package.
This package provides the necessary infrastructure for event-based communication between different parts of an application.

## Wooks CLI Adapter

The Wooks CLI adapter, `WooksCli`, is the main class provided by the `@wooksjs/event-cli` package.
It extends the `WooksAdapterBase` class from the wooks package and provides CLI-specific functionality.

The adapter utilizes the following components:

-   CLI-specific context composable: `useCliContext()` - This composable allows accessing the CLI context within the event processing workflow.
-   CLI Help Renderer: [CliHelpRenderer](https://github.com/prostojs/cli-help) - This component is responsible for rendering CLI command help information.

