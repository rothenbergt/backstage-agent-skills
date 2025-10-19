---
name: backstage-frontend-plugin
description: Build Backstage frontend plugins with the new Frontend System: createFrontendPlugin, blueprints, routes, Utility APIs, testing. Use for pages, nav, entity content, or cards.
version: 1.0.0
license: Complete terms in LICENSE.txt
---

# Backstage Frontend Plugin (New Frontend System)

## About This Skill

This skill provides specialized knowledge and workflows for building Backstage frontend plugins using the New Frontend System. It guides the development of UI features including pages, navigation items, entity cards/content, and shared Utility APIs.

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
- [📋 Extension Blueprints Reference](./reference/blueprints.md) - Comprehensive guide to PageBlueprint, NavItemBlueprint, EntityContentBlueprint, and ApiBlueprint

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
   - React components using `renderInTestApp`
   - Extensions using `createExtensionTester`
   - Utility APIs with mocked dependencies
3. Run tests and achieve good coverage:
   ```bash
   yarn backstage-cli package test --coverage
   ```

---

## Phase 4: Review and Polish

Before publishing:

1. Run linting and structure checks
2. Ensure all extensions are properly registered
3. Verify lazy loading and error boundaries
4. Check permission-based visibility where appropriate
5. Review the Common Pitfalls section below

---

## Quick Facts

- Create a plugin with `yarn new` → select plugin; it generates `plugins/<pluginId>/`.
- The plugin instance is built with `createFrontendPlugin` from `@backstage/frontend-plugin-api`. Export it as the default from `src/index.ts`.
- Functionality is provided via extensions (e.g., `PageBlueprint`, `NavItemBlueprint`, `EntityContentBlueprint`). These are lazy‑loaded using dynamic imports.
- Define route references with `createRouteRef` (usually in `src/routes.ts`) and use them in blueprints.
- Use Utility APIs for shared logic (`createApiRef` + `ApiBlueprint`), consumed via `useApi`.

### App integration patterns

- New Frontend System (preferred):
  - Apps using `@backstage/frontend-defaults` discover plugin extensions when the plugin is included at app creation.
  - Add your plugin to the app’s feature/plugin list; no need to export components. Routes declared by `PageBlueprint` are mounted automatically.
- Legacy apps (compat path):
  - If the app is still using `@backstage/app-defaults` and manual `FlatRoutes`, add a `<Route>` that renders your page component directly.
  - It’s acceptable to export a page component temporarily to bridge legacy routing, but prefer keeping components internal once migrated.

---

## Production Best Practices

### Extensions and Routes

- Keep all `routeRef`s in `src/routes.ts`
- Use `createSubRouteRef` for nested paths
- Export only the plugin (default from `src/index.ts`)
- Never export extensions/components from the package root

### Lazy Loading and UX

Use dynamic imports in loaders and wrap rendered elements in `Suspense` with a lightweight fallback. Add an error boundary for resilience:
  
  ```tsx
  // Suspense and error boundary around a lazy extension element
  const Example = React.lazy(() => import('./components/ExamplePage'));
  
  function ExampleWrapper() {
    return (
      <ErrorBoundary>
        <React.Suspense fallback={<div>Loading…</div>}>
          <Example />
        </React.Suspense>
      </ErrorBoundary>
    );
  }
  ```

### Utility APIs

- Keep API interfaces small and stable
- Wrap external clients/fetchers
- Provide a mock implementation for tests
- Register via `ApiBlueprint` and consume with `useApi`
- Do not fetch in render—use hooks/effects

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
- Avoid heavy logic in loaders
- Keep presentational components separate from data hooks

### Testing

- Use `@testing-library/react` to test extension output
- Mock Utility APIs
- Verify routeRefs with `useRouteRef` where navigation matters

---

## Golden Path (Copy/Paste Workflow)

### 1) Scaffold

```bash
# From the repository root
yarn new
# Select: plugin
# Enter plugin id (kebab case, e.g. example)
```

This creates `plugins/example/` with a minimal structure. ([Backstage][1])

### 2) Routes (`src/routes.ts`)

```ts
import { createRouteRef } from '@backstage/frontend-plugin-api';

// Keep routes here to avoid circular imports.
export const rootRouteRef = createRouteRef();
```

The route ref becomes the anchor for linking and navigation. ([Backstage][1])

### 3) Plugin + extensions (`src/plugin.ts`)

```tsx
import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
} from '@backstage/frontend-plugin-api';
import { rootRouteRef } from './routes';

// Page (lazy-loaded via dynamic import)
const examplePage = PageBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    path: '/example',
    loader: () => import('./components/ExamplePage').then(m => <m.ExamplePage />),
  },
});

// Sidebar navigation item
const exampleNavItem = NavItemBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    title: 'Example',
    icon: ExampleIcon, // custom SvgIcon or from MUI icon set
  },
});

// Export plugin instance; do NOT export extensions from the package
export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [examplePage, exampleNavItem],
  routes: { root: rootRouteRef },
});
```

Notes: export the plugin as the default export in `src/index.ts`; extensions are not exported by the package. ([Backstage][1])

### 4) Page component (`src/components/ExamplePage.tsx`)

```tsx
export function ExamplePage() {
  return (
    <div>
      <h1>Example</h1>
      <p>Hello World!</p>
    </div>
  );
}
```

### 5) Utility API (optional)

```ts
// src/api.ts
import { createApiRef } from '@backstage/frontend-plugin-api';

export interface ExampleApi {
  getExample(): { example: string };
}

export const exampleApiRef = createApiRef<ExampleApi>({ id: 'plugin.example' });

export class DefaultExampleApi implements ExampleApi {
  getExample() {
    return { example: 'Hello World!' };
  }
}
```

Register it with the `ApiBlueprint` and consume via `useApi`:

```ts
// src/plugin.ts
import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { exampleApiRef, DefaultExampleApi } from './api';

const exampleApi = ApiBlueprint.make({
  name: 'example',
  params: define =>
    define({
      api: exampleApiRef,
      deps: {},
      factory: () => new DefaultExampleApi(),
    }),
});

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [exampleApi, examplePage, exampleNavItem],
  routes: { root: rootRouteRef },
});
```

### 6) Entity integration (optional)

```tsx
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';

const exampleEntityContent = EntityContentBlueprint.make({
  params: {
    path: 'example',
    title: 'Example',
    loader: () =>
      import('./components/ExampleEntityContent').then(m => <m.ExampleEntityContent />),
  },
});
```

---

## Verify in an app

- If using the new Frontend System app:
  - Ensure the app is created with `@backstage/frontend-defaults` and your plugin is included at app creation.
  - Start the repo and visit the path declared by your `PageBlueprint`.
- If using a legacy app:
  - Import the page component and add a `<Route path="/example" element={<ExamplePage />} />` under `FlatRoutes`.
  - Start the repo and navigate to `/example`.

## Testing, linting & structure checks

Run tests and lints with Backstage's CLI:

```bash
yarn backstage-cli package test
yarn backstage-cli package lint
yarn backstage-cli repo lint
```

Keep a predictable structure (API layer, hooks, components, `routes.ts`, `plugin.ts`, `index.ts`).

---

## Common Pitfalls (and Fixes)

| Problem | Solution | Reference |
| ------- | -------- | --------- |
| **Extensions don't render** | Ensure they're passed in the plugin's `extensions` array; components must be lazy-loaded via dynamic imports | [Backstage][1] |
| **Navigation/links break** | Keep `routeRef`s in `src/routes.ts` and use `useRouteRef` to generate links | [Backstage][1] |
| **Consumers can't install your plugin** | Export the plugin as the default from `src/index.ts` | [Backstage][1] |

---

# Reference Files

## 📚 Documentation Library

Load these resources as needed during development:

### Extension Development
- [📋 Extension Blueprints Reference](./reference/blueprints.md) - Complete guide to all extension blueprints including:
  - PageBlueprint for creating pages
  - NavItemBlueprint for navigation items
  - EntityContentBlueprint for entity tabs
  - ApiBlueprint for Utility APIs
  - Advanced features like `makeWithOverrides`
  - Common patterns and best practices

### Utility API Development
- [🔌 Utility APIs Reference](./reference/utility_apis.md) - Creating and using Utility APIs including:
  - API interface definition patterns
  - Creating API references with `createApiRef`
  - Implementing default API classes
  - Registering with ApiBlueprint
  - Using APIs in components with `useApi`
  - Common API patterns (REST clients, caching, event bus)
  - Testing strategies

### Testing
- [✅ Testing Reference](./reference/testing.md) - Comprehensive testing guide including:
  - Testing React components with `renderInTestApp`
  - Testing extensions with `createExtensionTester`
  - Mocking Utility APIs with `TestApiProvider`
  - Testing permissions and entity components
  - Routes and navigation testing
  - Best practices and common patterns

---

## External References

- Building Frontend Plugins (New Frontend System): createFrontendPlugin, blueprints, routes, Utility APIs. ([Backstage][1])
- Anthropic Skill spec & packaging details (required metadata; ≤200 char description). ([Claude Help Center][2])

[1]: https://backstage.io/docs/frontend-system/building-plugins/index/
[2]: https://support.claude.com/en/articles/12512198-creating-custom-skills
