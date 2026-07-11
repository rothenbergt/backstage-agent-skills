# Extension Blueprints Reference

## Overview

Extension blueprints expose a `make` method to create extensions and are the recommended way to add functionality to a Backstage frontend plugin. Each blueprint is a typed factory that enforces the inputs, outputs, and attachment point of the extensions it produces.

Blueprints live in several packages depending on what they extend:

| Package | Blueprints |
| ------- | ---------- |
| `@backstage/frontend-plugin-api` | `PageBlueprint`, `SubPageBlueprint`, `ApiBlueprint`, `AppRootElementBlueprint`, `PluginHeaderActionBlueprint`, `NavItemBlueprint` (deprecated) |
| `@backstage/frontend-plugin-api/alpha` | `PluginWrapperBlueprint` |
| `@backstage/plugin-app-react` | `ThemeBlueprint`, `SignInPageBlueprint`, `IconBundleBlueprint`, `TranslationBlueprint`, `RouterBlueprint`, `AppRootWrapperBlueprint`, `NavContentBlueprint`, `SwappableComponentBlueprint`, `AnalyticsImplementationBlueprint` |
| `@backstage/plugin-catalog-react/alpha` | `EntityContentBlueprint`, `EntityCardBlueprint`, `EntityHeaderBlueprint`, `EntityContentLayoutBlueprint`, `EntityContextMenuItemBlueprint`, `EntityIconLinkBlueprint`, `CatalogFilterBlueprint` |

---

## Core Blueprint Types

### PageBlueprint

Creates page extensions that render at specific routes. Also acts as a container when used without a `loader` — child `SubPageBlueprint` extensions render as tabs under it.

**Package**: `@backstage/frontend-plugin-api`

**Key Features**:
- Default path configuration (overridable via app-config)
- Lazy loading via dynamic imports (no manual `React.lazy` needed)
- Automatic sidebar entry when `title` + `icon` are provided
- Tabbed sub-pages when combined with `SubPageBlueprint`

**Usage Pattern**:

```tsx
import { PageBlueprint } from '@backstage/frontend-plugin-api';
import ExampleIcon from '@material-ui/icons/Extension';
import { rootRouteRef } from './routes';

const examplePage = PageBlueprint.make({
  params: {
    routeRef: rootRouteRef,
    path: '/example',
    title: 'Example',          // becomes sidebar label + page header
    icon: ExampleIcon,         // becomes sidebar icon
    loader: () => import('./components/ExamplePage').then(m => <m.ExamplePage />),
  },
});
```

**Parameters**:
- `path` (required): URL path for the page.
- `routeRef` (optional): Route reference for external linking.
- `title`, `icon` (optional): Drive the page header and auto-generated sidebar entry.
- `loader` (optional): Async component loader. Omit to build a tabbed parent — see `SubPageBlueprint`.
- `noHeader` (optional): Hide the default plugin page header so the page fills the viewport.

---

### SubPageBlueprint

Creates a tab under a parent `PageBlueprint` that has no `loader`.

**Package**: `@backstage/frontend-plugin-api`

**Usage Pattern**:

```tsx
import { SubPageBlueprint } from '@backstage/frontend-plugin-api';

const overviewTab = SubPageBlueprint.make({
  name: 'overview',
  params: {
    path: '',           // relative to the parent page's path
    title: 'Overview',  // the tab label
    loader: () =>
      import('./components/Overview').then(m => <m.Overview />),
  },
});
```

Register the parent page (no `loader`) and all sub-pages in the plugin's `extensions` array; the parent page renders a tab bar whose contents come from the sub-pages' output.

---

### EntityContentBlueprint

Creates content tabs for entity pages in the catalog plugin.

**Package**: `@backstage/plugin-catalog-react/alpha`

**Usage Pattern**:

```tsx
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';

const exampleEntityContent = EntityContentBlueprint.make({
  params: {
    path: 'example',
    title: 'Example',
    loader: () =>
      import('./components/ExampleEntityContent').then(m => <m.ExampleEntityContent />),
    // Optional: restrict to a set of entity kinds/types.
    // The filter value accepts entity ref or query strings such as 'kind:component,api'.
    // filter: 'kind:component',
    // Optional: assign to a named tab group (e.g. 'overview', 'development').
    // group: 'overview',
    // Optional: icon shown in the tab strip.
    // icon: ExampleIcon,
  },
});
```

**Parameters**:
- `path`, `title`, `loader` (required).
- `routeRef` (optional): Route reference for external linking.
- `icon` (optional): Icon for the tab.
- `filter` (optional): Limit which entities show the content.
- `group` (optional): Tab-group key; see `defaultEntityContentGroups` for the built-in groups.

**Best Practices**:
- Keep entity content extensions small and focused
- Avoid heavy logic in loaders
- Use `usePermission` to control visibility for sensitive content
- Handle missing entity data gracefully

---

### ApiBlueprint

Creates Utility API extensions for shared logic across plugins.

**Package**: `@backstage/frontend-plugin-api`

**Usage Pattern**:

```tsx
import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { discoveryApiRef, fetchApiRef } from '@backstage/frontend-plugin-api';
import { exampleApiRef, DefaultExampleApi } from './api';

const exampleApi = ApiBlueprint.make({
  name: 'example',
  params: defineParams =>
    defineParams({
      api: exampleApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new DefaultExampleApi({ discoveryApi, fetchApi }),
    }),
});
```

**Parameters**:
- `name`: Unique identifier for the API extension within the plugin.
- `params`: `defineParams` callback returning:
  - `api`: API reference created with `createApiRef`.
  - `deps`: Map of other API refs this implementation depends on.
  - `factory`: Function that receives resolved deps and returns the API implementation.

The callback parameter is named `defineParams` everywhere in upstream docs and plugin source — stick to that name for consistency.

**API Reference Pattern**:

```tsx
import { createApiRef } from '@backstage/frontend-plugin-api';
import type {
  DiscoveryApi,
  FetchApi,
} from '@backstage/frontend-plugin-api';

export interface ExampleApi {
  fetchData(id: string): Promise<Data>;
  updateData(id: string, data: Data): Promise<void>;
}

export const exampleApiRef = createApiRef<ExampleApi>({
  id: 'plugin.example.api',
});

export class DefaultExampleApi implements ExampleApi {
  constructor(
    private options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi },
  ) {}

  async fetchData(id: string): Promise<Data> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('example');
    const res = await this.options.fetchApi.fetch(`${baseUrl}/data/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    return res.json();
  }

  async updateData(id: string, data: Data): Promise<void> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('example');
    const res = await this.options.fetchApi.fetch(`${baseUrl}/data/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update: ${res.statusText}`);
  }
}
```

---

### PluginHeaderActionBlueprint

Adds an action (button, menu item, etc.) to a specific plugin page's header.

**Package**: `@backstage/frontend-plugin-api`

Use for things like "Create new", "Export", "Open settings" buttons that live next to the plugin page title. Actions are scoped to the plugin they are defined in — the action only appears when one of that plugin's pages is the active route.

---

### NavItemBlueprint (deprecated)

Previously used to add entries to the sidebar. **Now deprecated** — nav items are auto-inferred from `PageBlueprint` extensions (and plugin-level `title`/`icon`).

If you have legacy code using `NavItemBlueprint`, remove it and set `title` and `icon` on your `PageBlueprint.params` instead.

---

## App-level Blueprints (`@backstage/plugin-app-react`)

These are most often used by app integrators and by plugins that customize the app shell:

- **`ThemeBlueprint`** — Register a new theme (e.g. a company-branded theme).
- **`SignInPageBlueprint`** — Provide a custom sign-in page.
- **`IconBundleBlueprint`** — Extend the global icon registry with custom named icons.
- **`TranslationBlueprint`** — Register translation resources for i18n.
- **`RouterBlueprint`** — Swap the router implementation.
- **`AppRootWrapperBlueprint`** — Wrap the app root with custom providers.
- **`NavContentBlueprint`** — Customize what renders inside the sidebar.
- **`SwappableComponentBlueprint`** — Register a component that integrators can swap.
- **`AnalyticsImplementationBlueprint`** — Provide a custom analytics backend (the core API ref for analytics lives in `@backstage/core-plugin-api`; the blueprint is the NFS registration mechanism).

---

## Advanced Features

### makeWithOverrides

Every extension blueprint also exposes a `makeWithOverrides` method, used when authoring a reusable blueprint that exposes additional inputs, outputs, or config to integrators. It is **not** the same as `make` + a `config` option — it extends the underlying blueprint definition. Most plugin code uses plain `.make(...)`; reach for `makeWithOverrides` only when building infrastructure that other plugins consume.

For authoring brand-new blueprints, see `createExtensionBlueprint` (also exported from `@backstage/frontend-plugin-api`). This is the primitive that all built-in blueprints use under the hood.

### Config schema

Extensions can expose a Zod config schema so integrators can tweak them from `app-config.yaml`. Most built-in blueprints expose at least `path`/`title` overrides — see the docs for [Common Extension Blueprints](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/) for what each blueprint lets you override.

### attachTo

Every extension has an `attachTo` that points to a parent node in the extension tree. For blueprints, the default attachment is set by the blueprint itself — e.g. `PageBlueprint` attaches to `app/routes`, `NavItemBlueprint` attaches to `app/nav`. You rarely need to override it directly, but it is exposed on `make` if you do need a non-default parent (for example, routing a page under a different parent).

---

## Extension Registration

All extensions created with blueprints must be listed in the plugin's `extensions` array:

```tsx
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  // Plugin-level title/icon become the fallback for auto-inferred nav entries.
  title: 'Example',
  extensions: [
    examplePage,
    exampleApi,
    exampleEntityContent,
  ],
  routes: {
    root: rootRouteRef,
  },
});
```

`createFrontendPlugin` also accepts `externalRoutes`, `featureFlags`, `if` (for conditional feature loading), and `info` (a loader that returns plugin metadata).

---

## Best Practices

### Lazy Loading

Always use dynamic imports in loader functions to enable code splitting. The blueprint handles the `React.lazy`/`Suspense` wiring for you:

```tsx
// Good
loader: () => import('./components/Page').then(m => <m.Page />),

// Bad - no code splitting, imported eagerly
import { Page } from './components/Page';
loader: () => Promise.resolve(<Page />),
```

### Route Organization

Keep all route references in `src/routes.ts`:

```tsx
import {
  createRouteRef,
  createSubRouteRef,
  createExternalRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const detailsRouteRef = createSubRouteRef({
  parent: rootRouteRef,
  path: '/details/:id',
});

// For linking into other plugins that the integrator binds at app creation.
export const catalogEntityRouteRef = createExternalRouteRef();
```

### Extension Naming

Use descriptive names that reflect the extension's purpose:

```tsx
// Good
const userDashboardPage = PageBlueprint.make({ ... });
const searchSettingsApi = ApiBlueprint.make({ name: 'settings', ... });

// Bad
const page1 = PageBlueprint.make({ ... });
const api = ApiBlueprint.make({ ... });
```

---

## Common Patterns

### Conditional Entity Content

Show entity content only when appropriate:

```tsx
import { useEntity } from '@backstage/plugin-catalog-react';

export function ConditionalEntityContent() {
  const { entity } = useEntity();

  if (entity.kind !== 'Component') {
    return null;
  }

  return <div>Component-specific content</div>;
}
```

Prefer using `EntityContentBlueprint`'s `filter` param when possible — it avoids rendering the tab at all for non-matching entities.

### Permission-Based Visibility

```tsx
import { usePermission } from '@backstage/plugin-permission-react';
import { examplePermission } from './permissions';

export function PermissionGatedContent() {
  const { loading, allowed } = usePermission({ permission: examplePermission });
  if (loading) return null;
  if (!allowed) return <div>Access denied</div>;
  return <div>Protected content</div>;
}
```

### API Consumption

Use Utility APIs in components via `useApi` imported from `@backstage/frontend-plugin-api`:

```tsx
import { useApi } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import { exampleApiRef } from './api';

export function DataComponent({ id }: { id: string }) {
  const exampleApi = useApi(exampleApiRef);
  const { value, loading, error } = useAsync(
    () => exampleApi.fetchData(id),
    [exampleApi, id],
  );

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{value?.name}</div>;
}
```

---

## Official Documentation

For the latest information, consult:
- [Frontend Extension Blueprints](https://backstage.io/docs/frontend-system/architecture/extension-blueprints/)
- [Common Extension Blueprints](https://backstage.io/docs/frontend-system/building-plugins/common-extension-blueprints/)
- [Building Frontend Plugins](https://backstage.io/docs/frontend-system/building-plugins/)
- [Utility APIs](https://backstage.io/docs/frontend-system/utility-apis/)
