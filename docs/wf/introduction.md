# Introduction to Wooks Workflows

Wooks Workflows, made available through the `@wooksjs/event-wf` module, is a powerful extension to the Wooks event processing framework. It offers an elegant, declarative solution for defining and executing complex workflows.

## Why Use Workflows in this Manner?

When building complex systems, especially in microservices architectures or similar distributed structures, you often encounter situations where tasks need to be executed in a specific order, or dependent on certain conditions. These tasks might require user inputs, be interdependent, or involve repeated execution. Describing and managing such tasks in code can become extremely complex and hard to maintain.

Wooks Workflows address these issues by providing a means to define and manage these tasks declaratively. By using workflows, you gain a clearer, more organized structure that reduces complexity and makes your code easier to maintain and reason about. The structure of the workflow is also easier to visualize and understand, even for non-technical stakeholders.

## Typical Use Cases

Wooks Workflows can be applied to a wide range of scenarios. It is particularly useful for:

- **Task automation:** Workflows can be used to automate repetitive tasks, such as data validation, report generation, and periodic system health checks.

- **User interaction flows:** Authentication, registration, order placements, and similar multi-step user interaction processes can be modeled and managed as workflows.

- **Business processes:** Complex business processes involving multiple steps and conditional paths, such as loan approval processes or order fulfillment processes, can be effectively managed using workflows.

- **State management:** Workflows can be used to manage the state of a system or a process over time, including handling transitions and actions triggered by state changes.

## Relationship with @prostojs/wf

`@wooksjs/event-wf` is built on top of the [@prostojs/wf](https://github.com/prostojs/wf) module. The `@prostojs/wf` module forms the foundation of Wooks Workflows and provides the core functionalities for defining steps, conditions, and inputs. Wooks extends upon this foundation to provide additional features and integration with the Wooks event processing framework.

## Routing Flexibility with Wooks Workflows

One of the key features introduced by Wooks Workflows is routing flexibility. A step in the workflow can be represented as a route with parameters (e.g., `add/:n`). This means when a step like `add/5` is called, some context can already be provided to the node explicitly while describing the workflow. This routing flexibility allows for the creation of dynamic workflows based on parameters, enabling a high degree of customization and adaptability.

In conclusion, Wooks Workflows provide a powerful, declarative tool for handling complex tasks and business processes, simplifying your code and making it easier to understand and maintain. By leveraging routing flexibility, Wooks Workflows brings even more adaptability and dynamic behavior to your applications.

More about [Routing in Wooks Workflows](/wf/routing)
