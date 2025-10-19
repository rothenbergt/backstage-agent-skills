# Backstage Agent Skills

Claude skills for building Backstage plugins with the New Frontend and Backend Systems.

## Available Skills

### backstage-frontend-plugin

Build Backstage frontend plugins with createFrontendPlugin, blueprints, routes, Utility APIs, and testing. Use for creating pages, navigation items, entity content, or cards.

**Includes:**

- Step-by-step development workflow
- Extension blueprints guide (PageBlueprint, NavItemBlueprint, EntityContentBlueprint, ApiBlueprint)
- Utility API patterns and best practices
- Comprehensive testing guide with @backstage/frontend-test-utils

### backstage-backend-plugin

Build Backstage backend plugins with createBackendPlugin and core services. Use for creating REST/HTTP APIs, background jobs, data processing, and integrations.

**Includes:**

- Step-by-step development workflow
- Core services reference (httpRouter, logger, database, auth, scheduler, cache, etc.)
- Production-ready patterns for validation, error handling, and security
- Comprehensive testing guide with @backstage/backend-test-utils

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

## License

Apache-2.0 - See LICENSE.txt in each skill folder for complete terms.

## Contributing

Contributions Welcome! Please ensure any contributions align with current Backstage best practices and the New Frontend/Backend Systems.
