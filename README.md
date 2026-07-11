# Backstage Agent Skills

Claude skills for building Backstage plugins with the New Frontend and Backend Systems.

## Available Skills

### backstage-frontend-plugin

Build Backstage frontend plugins with the New Frontend System (`createFrontendPlugin`, blueprints, routes, Utility APIs, testing). Use for creating pages, navigation items, entity content, or cards.

**Includes:**

- Step-by-step development workflow against the current `yarn new` frontend-plugin template (already NFS-wired)
- Extension blueprints guide (`PageBlueprint`, `SubPageBlueprint`, `EntityContentBlueprint`, `ApiBlueprint`, app-level blueprints) with notes on the deprecated `NavItemBlueprint`
- Utility API patterns (with imports from `@backstage/frontend-plugin-api`) and best practices
- Comprehensive testing guide with `@backstage/frontend-test-utils` (`renderInTestApp`, `createExtensionTester(...).reactElement()`, `mockApis.*`)

### backstage-backend-plugin

Build Backstage backend plugins and modules with `createBackendPlugin`, core services, and extension points. Use for REST/HTTP APIs, background jobs, data processing, integrations, and modules that extend existing plugins.

**Includes:**

- Step-by-step development workflow against the current `yarn new` backend-plugin template (`src/router.ts`, `express-promise-router`, `zod`, service refs)
- Core services reference covering every `coreServices.*` entry (httpRouter, logger, database, httpAuth, userInfo, auth, scheduler, cache, urlReader, permissions, permissionsRegistry, auditor, lifecycle, rootHealth, …)
- Modules + extension points (`createBackendModule`, `env.registerExtensionPoint`)
- Production-ready patterns for validation, error handling (via `MiddlewareFactory` / root error middleware), and security
- Comprehensive testing guide with `@backstage/backend-test-utils` (`startTestBackend` + `supertest`, `mockServices`, `mockCredentials`, MSW v2, `TestDatabases`)

## Installation

Each skill is a self-contained folder with:

- `SKILL.md` - Main skill instructions and workflow
- `reference/` - Detailed reference documentation loaded on-demand

Import the skill folder into your Claude Code environment to use.

## Structure

Both skills follow the progressive disclosure principle:

1. **Metadata** - Brief description for skill selection
2. **SKILL.md** - Core workflow and quick reference
3. **Reference files** - Detailed documentation loaded as needed

## Cleanup scripts

Concise helpers to strip scaffolded example code after generating a plugin.

- Frontend: removes the example todo components, creates a minimal PluginNamePage, and updates plugin.tsx.
- Backend: removes the example todo service and tests, simplifies the router to /health, and opens /health with an auth policy so it works without credentials.

## License

Apache-2.0 - See LICENSE.txt in each skill folder for complete terms.

## Contributing

Contributions Welcome! Please ensure any contributions align with current Backstage best practices and the New Frontend/Backend Systems.
