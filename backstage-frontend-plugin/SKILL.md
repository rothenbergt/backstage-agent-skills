---
name: backstage-frontend-plugin
description: "Build Backstage frontend plugins with the New Frontend System: createFrontendPlugin, blueprints, routes, Utility APIs, testing. Use for pages, nav, entity content, or cards."
version: 1.2.0
license: Complete terms in LICENSE.txt
---

# Backstage Frontend Plugin (New Frontend System)

## About This Skill

This skill provides specialized knowledge and workflows for building Backstage frontend plugins using the New Frontend System (NFS). It guides the development of UI features including pages, navigation items, entity cards/content, and shared Utility APIs.

### What This Skill Provides

1. **Specialized workflows** - Step-by-step procedures for creating and configuring frontend plugins
2. **Best practices** - Production-ready patterns for lazy loading, error handling, permissions, and testing
3. **Golden path templates** - Copy/paste code snippets for common plugin patterns
4. **Domain expertise** - Backstage-specific knowledge about blueprints, routes, and the plugin system

### When to Use This Skill

Use this skill when creating UI features for Backstage: pages, navigation items, entity cards/content, or shared Utility APIs.

---

# Development Workflow

## Phase 1: Planning and Research

### 1.1 Understand the Requirements

Before building a frontend plugin, clearly understand:
- What UI features are needed (pages, navigation, entity content, cards)
- What data the plugin will display or interact with
- Whether Utility APIs are needed for shared logic
- Integration points with other plugins (catalog, permissions, etc.)

### 1.2 Load Reference Documentation

Load reference files as needed based on the plugin requirements:

**For Extension Development:**
- [📋 Extension Blueprints Reference](./reference/blueprints.md) - Comprehensive guide to PageBlueprint, SubPageBlueprint, EntityContentBlueprint, ApiBlueprint, and app-level blueprints

**For Utility API Development:**
- [🔌 Utility APIs Reference](./reference/utility_apis.md) - Creating and using Utility APIs for shared logic

**For Testing:**
- [✅ Testing Reference](./reference/testing.md) - Comprehensive testing guide for components, extensions, and APIs

---

## Phase 2: Implementation

Follow the Golden Path workflow below for implementation, referring to reference files as needed.

---

## Phase 3: Testing

After implementing the plugin:

1. Load the [✅ Testing Reference](./reference/testing.md)
2. Write comprehensive tests for:
   - React components using `renderInTestApp` with the `apis` option
   - Extensions using `createExtensionTester(...).reactElement()`
   - Utility APIs with mocked dependencies
3. Run tests and achieve good coverage:
   ```bash
   yarn backstage-cli package test --coverage --watchAll=false
   ```

---

## Phase 4: Review and Polish

Before publishing:

1. Run linting and structure checks
2. Ensure all extensions are listed in the plugin's `extensions` array
3. Verify lazy loading via dynamic imports in every `loader`
4. Check permission-based visibility where appropriate
5. Review the Common Pitfalls section below

---

## Quick Facts

- Create a plugin with `yarn new` → select `frontend-plugin`; it generates `plugins/<pluginId>/` **already wired for the New Frontend System**.
- The plugin instance is built with `createFrontendPlugin` from `@backstage/frontend-plugin-api`. Export it as the default from `src/index.ts`.
- Functionality is provided via extensions (`PageBlueprint`, `SubPageBlueprint`, `ApiBlueprint`, `EntityContentBlueprint`, etc.). Page content is always lazy-loaded using dynamic imports.
- Define route references with `createRouteRef` (usually in `src/routes.ts`) and use them in blueprints.
- Use Utility APIs for shared logic (`createApiRef` + `ApiBlueprint`), consumed via `useApi`.
- Hooks (`useApi`, `useRouteRef`) and built-in API refs (`discoveryApiRef`, `fetchApiRef`, `identityApiRef`, `alertApiRef`, `errorApiRef`, `storageApiRef`) should be imported from `@backstage/frontend-plugin-api` in NFS code — they are still re-exported from `@backstage/core-plugin-api` but that is the legacy import path.
- The `dev/index.tsx` entrypoint uses `createDevApp` from `@backstage/frontend-dev-utils` and is started via `yarn start` inside the plugin directory.

### App integration patterns

- **New Frontend System (preferred):**
  - Apps using `@backstage/frontend-defaults` auto-discover a plugin's extensions when the package is installed and listed as a feature.
  - Just install the plugin; routes declared by `PageBlueprint` mount automatically and their `title`/`icon` drive the sidebar.
- **Legacy apps (compat path):**
  - Only relevant if your target app is still using `@backstage/app-defaults` and manual `FlatRoutes`. Most new work should target NFS.

---

## Production Best Practices

### Extensions and Routes

- Keep all `routeRef`s in `src/routes.ts`
- Use `createSubRouteRef` for nested paths
- Export only the plugin (default from `src/index.ts`)
- Never export extensions/components from the package root

### Lazy Loading and UX

`PageBlueprint` automatically wraps the `loader` with React `Suspense` and an error boundary — no need to add them yourself at the extension level. Just keep your loader as a dynamic import:

```tsx
loader: () => import('./components/ExamplePage').then(m => <m.ExamplePage />),
```

If you need an error boundary *inside* a component (e.g. around a risky subtree), use `ErrorBoundary` from `@backstage/core-components`.

### Utility APIs

- Keep API interfaces small and stable
- Wrap external clients/fetchers
- Provide a mock implementation for tests
- Register via `ApiBlueprint` and consume with `useApi` from `@backstage/frontend-plugin-api`
- Do not fetch in render — use hooks/effects (or a helper like `useAsync` from `react-use`)

### Permissions and Visibility

Hide/show entity content based on permissions or ownership to avoid broken UX for unauthorized users:

```tsx
import { usePermission } from '@backstage/plugin-permission-react';
import { somePermission } from '@backstage/plugin-permission-common';

export function ExampleEntityContent() {
  const { loading, allowed } = usePermission({ permission: somePermission });
  if (loading) return null;
  if (!allowed) return null; // or render a friendly message/banner
  return <div>Secret content</div>;
}
```

### Entity Integrations

- Prefer small, focused entity content extensions
- Use the `filter` param on `EntityContentBlueprint` to limit to certain entity kinds
- Keep presentational components separate from data hooks

### Testing

- Prefer passing `apis` to `renderInTestApp`/`createExtensionTester` over wrapping with `TestApiProvider`
- Use `mockApis.*` helpers (`mockApis.identity(...)`, etc.) for common mocks
- Verify routeRefs with `useRouteRef` via the `mountedRoutes` option where navigation matters

---

## Golden Path (Copy/Paste Workflow)

### 1) Scaffold

```bash
# From the repository root (interactive)
yarn new
# Select: frontend-plugin
# Enter plugin id (kebab case, e.g. example)

# Non-interactive (for AI agents/automation)
yarn new --select frontend-plugin --option pluginId=example --option owner=""
```

This creates `plugins/example/` already wired for the New Frontend System:

- `src/plugin.tsx` — `createFrontendPlugin` + `PageBlueprint`
- `src/routes.ts` — `createRouteRef()`
- `src/index.ts` — `export { examplePlugin as default } from './plugin'`
- `src/components/` — example page + list components
- `dev/index.tsx` — `createDevApp({ features: [plugin] })` for standalone dev

The scaffold ships a working example todo app (`src/components/TodoPage/` and `src/components/TodoList/`). Run the cleanup script to strip the example and leave a minimal named page component:

```bash
node scripts/cleanup-scaffolding.js plugins/example
```

> **Legacy apps only:** If `yarn new` detects a legacy-app repo, it will offer the `legacy-frontend-plugin` template instead. In that case you'll need to convert manually to NFS — see the migration guide at `docs/frontend-system/building-plugins/05-migrating.md`.

### 2) Routes (`src/routes.ts`)

```ts
import { createRouteRef, createSubRouteRef } from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

// Optional: nested paths
export const detailsRouteRef = createSubRouteRef({
  parent: rootRouteRef,
  path: '/details/:id',
});
```

### 3) Plugin (`src/plugin.tsx`)

```tsx
import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';
import { rootRouteRef } from './routes';

// Sidebar entry is auto-inferred from the page's title + icon.
const examplePage = PageBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    path: '/example',
    title: 'Example',
    icon: ExampleIcon,
    loader: () => import('./components/ExamplePage').then(m => <m.ExamplePage />),
  },
});

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [examplePage],
  routes: { root: rootRouteRef },
});
```

> **Note:** `NavItemBlueprint` is deprecated and has been removed entirely on current Backstage main. Nav items are now auto-inferred from any `PageBlueprint` that has a `title` and `icon`, or from the plugin-level `title`/`icon` on `createFrontendPlugin`. New code should not use `NavItemBlueprint`.

### 4) Page Component (`src/components/ExamplePage.tsx`)

Standard React component, no NFS-specific wrapping required:

```tsx
export function ExamplePage() {
  return (
    <div>
      <h1>Example</h1>
      <p>Hello from the New Frontend System!</p>
    </div>
  );
}
```

### 5) Index (`src/index.ts`)

Only export the plugin as default:

```ts
export { examplePlugin as default } from './plugin';
```

### 6) Utility API (optional)

```ts
// src/api.ts
import { createApiRef } from '@backstage/frontend-plugin-api';

export interface ExampleApi {
  getExample(): { example: string };
}

export const exampleApiRef = createApiRef<ExampleApi>({ id: 'plugin.example.api' });

export class DefaultExampleApi implements ExampleApi {
  getExample() {
    return { example: 'Hello World!' };
  }
}
```

Register it with `ApiBlueprint` and consume via `useApi`:

```ts
// src/plugin.tsx
import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { exampleApiRef, DefaultExampleApi } from './api';

const exampleApi = ApiBlueprint.make({
  name: 'example',
  params: defineParams =>
    defineParams({
      api: exampleApiRef,
      deps: {},
      factory: () => new DefaultExampleApi(),
    }),
});

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [exampleApi, examplePage],
  routes: { root: rootRouteRef },
});
```

Note the callback parameter is `defineParams` — all upstream docs and real-world plugin code use this name.

### 7) Entity integration (optional)

```tsx
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';

const exampleEntityContent = EntityContentBlueprint.make({
  params: {
    path: 'example',
    title: 'Example',
    loader: () =>
      import('./components/ExampleEntityContent').then(m => <m.ExampleEntityContent />),
    // Optional: limit to specific entity kinds
    // filter: 'kind:component,api',
    // Optional: tab grouping
    // group: 'overview',
  },
});
```

### 8) Sub-pages with tabs (optional)

Create a tabbed parent page by combining `PageBlueprint` (without a `loader`) with several `SubPageBlueprint` children that attach to the parent:

```tsx
import {
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';

const parentPage = PageBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    path: '/example',
    title: 'Example',
    // No loader — inputs.pages render as tabs
  },
});

const overviewTab = SubPageBlueprint.make({
  name: 'overview',
  params: {
    path: '',
    title: 'Overview',
    loader: () => import('./components/Overview').then(m => <m.Overview />),
  },
});
```

---

## Verify in an app

- If using the new Frontend System app (`@backstage/frontend-defaults`):
  - Include your plugin as a feature at app creation.
  - Start the repo (`yarn start`) and visit the path declared by your `PageBlueprint`.
- Standalone dev (inside the plugin directory):
  - Run `yarn start`; `dev/index.tsx` uses `createDevApp` to render your plugin with just the features you pass in.

## Testing, linting & structure checks

Run tests and lints with Backstage's CLI:

```bash
# Always pass --watchAll=false when running non-interactively (CI, AI agents);
# without it jest starts in watch mode and never exits.
yarn backstage-cli package test --watchAll=false
yarn backstage-cli package lint
yarn backstage-cli repo lint
```

Keep a predictable structure (API layer, hooks, components, `routes.ts`, `plugin.tsx`, `index.ts`).

---

## Common Pitfalls (and Fixes)

| Problem | Solution |
| ------- | -------- |
| **Extensions don't render** | Ensure they're passed in the plugin's `extensions` array; `loader`s must use dynamic imports. |
| **Navigation/links break** | Keep `routeRef`s in `src/routes.ts` and use `useRouteRef` from `@backstage/frontend-plugin-api` to generate links. |
| **Consumers can't install your plugin** | Export the plugin as the default export from `src/index.ts`. |
| **"Extension must be attached to a parent"** | Use the correct blueprint (`PageBlueprint` attaches to `app/routes`; `SubPageBlueprint` to a parent page; `EntityContentBlueprint` to the entity page). |
| **Sidebar item missing** | Provide `title` + `icon` on `PageBlueprint.params`, or set plugin-level `title`/`icon` on `createFrontendPlugin`. |
| **Import hygiene warnings** | In NFS code, import `useApi`, `useRouteRef`, and the built-in API refs from `@backstage/frontend-plugin-api`, not `@backstage/core-plugin-api`. |

---

# Reference Files

## 📚 Documentation Library

Load these resources as needed during development:

### Extension Development
- [📋 Extension Blueprints Reference](./reference/blueprints.md) — Complete guide to extension blueprints including:
  - `PageBlueprint` / `SubPageBlueprint` for pages and tab hierarchies
  - `ApiBlueprint` for Utility APIs
  - `EntityContentBlueprint` / `EntityCardBlueprint` / `EntityHeaderBlueprint` etc. (catalog)
  - `PluginHeaderActionBlueprint`, `PluginWrapperBlueprint` (alpha)
  - App-level blueprints in `@backstage/plugin-app-react` (`ThemeBlueprint`, `SignInPageBlueprint`, `IconBundleBlueprint`, etc.)
  - `makeWithOverrides` and custom blueprint authoring

### Utility API Development
- [🔌 Utility APIs Reference](./reference/utility_apis.md) — Creating and using Utility APIs including:
  - API interface definition patterns
  - Creating API references with `createApiRef`
  - Implementing default API classes
  - Registering with `ApiBlueprint`
  - Using APIs in components with `useApi`
  - Common API patterns (REST clients, caching, event bus)
  - Testing strategies

### Testing
- [✅ Testing Reference](./reference/testing.md) — Comprehensive testing guide including:
  - Testing React components with `renderInTestApp` and the `apis` option
  - Testing extensions with `createExtensionTester(...).reactElement()`
  - `mockApis.*` helpers and `TestApiProvider` for standalone rendering
  - Testing permissions and entity components
  - Routes and navigation testing
  - Best practices and common patterns

---

## External References

- [Building Frontend Plugins](https://backstage.io/docs/frontend-system/building-plugins/) — NFS plugin authoring.
- [Extension Blueprints](https://backstage.io/docs/frontend-system/architecture/extension-blueprints/) — Framework reference.
- [Common Extension Blueprints](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/) — Cheat sheet for all built-in blueprints.
- [Frontend System Testing](https://backstage.io/docs/frontend-system/building-plugins/testing/) — Canonical testing guide.
