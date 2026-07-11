---
name: backstage-backend-plugin
description: "Build Backstage backend plugins and modules with createBackendPlugin: DI, httpRouter, secure-by-default auth, Knex DB, scheduler, testing, extension points. Use for APIs, modules, and background jobs."
version: 1.2.0
license: Complete terms in LICENSE.txt
---

# Backstage Backend Plugin (New Backend System)

## About This Skill

This skill provides specialized knowledge and workflows for building Backstage backend plugins and modules using the New Backend System. It guides the development of server-side functionality including REST/HTTP APIs, background jobs, data processing, and integrations, plus the module/extension-point pattern used to extend other plugins.

### What This Skill Provides

1. **Specialized workflows** - Step-by-step procedures for creating and configuring backend plugins and modules
2. **Best practices** - Production-ready patterns for auth, validation, error handling, and database usage
3. **Golden path templates** - Copy/paste code snippets for common backend patterns
4. **Domain expertise** - Backstage-specific knowledge about DI, core services, and secure-by-default architecture

### When to Use This Skill

Use this skill when creating server-side functionality for Backstage: REST/HTTP APIs, background jobs, data processing, integrations, or modules that extend an existing plugin's extension points.

---

# Development Workflow

## Phase 1: Planning and Research

### 1.1 Understand the Requirements

Before building a backend plugin, clearly understand:
- What endpoints or APIs are needed (REST, GraphQL, webhooks)
- What data storage requirements exist (database, cache)
- Whether background jobs or scheduled tasks are needed
- Authentication and authorization requirements
- Whether you're writing a **plugin** (new surface area) or a **module** (extending another plugin's extension points)
- Integration points with other services or plugins

### 1.2 Load Reference Documentation

Load reference files as needed based on the plugin requirements:

**For Core Services:**
- [⚙️ Core Services Reference](./reference/core_services.md) - Comprehensive guide to all core backend services including:
  - httpRouter, logger, database, httpAuth, userInfo, auth
  - cache, scheduler, urlReader, discovery, permissions, permissionsRegistry
  - auditor, lifecycle, rootHealth, rootConfig, rootInstanceMetadata
  - Usage patterns and best practices for each service

**For Testing:**
- [✅ Testing Reference](./reference/testing.md) - Comprehensive testing guide for backend plugins

---

## Phase 2: Implementation

Follow the Golden Path workflow below for implementation, referring to reference files as needed.

**Important Decisions:**
- Determine which core services are needed (load [⚙️ Core Services Reference](./reference/core_services.md))
- Plan database schema and migrations if using database
- Design authentication policies (which endpoints, if any, should be unauthenticated?)
- Plan error handling and validation strategies
- Decide whether extension points are needed so other teams can extend this plugin

---

## Phase 3: Testing

After implementing the plugin:

1. Load the [✅ Testing Reference](./reference/testing.md)
2. Write comprehensive tests for:
   - Plugin/module integration via `startTestBackend`
   - Router endpoints using `supertest` against the test server
   - Database operations with `TestDatabases`
   - External service calls with MSW (v2 API)
   - Authentication flows using `mockCredentials` and `mockServices.httpAuth.mock`
3. Run tests and achieve good coverage:
   ```bash
   yarn backstage-cli package test --coverage --watchAll=false
   ```

---

## Phase 4: Review and Polish

Before publishing:

1. Run linting and structure checks
2. Ensure proper error handling throughout — let errors bubble up so the root HTTP router's error middleware formats them
3. Verify authentication policies are correct (backends are secure by default)
4. Check database migrations are production-ready and written in JavaScript
5. Review the Common Pitfalls section below
6. Test horizontal scalability (no in-memory state; use the `cache` or `database` services)

---

## Quick Facts

- Scaffold with `yarn new` → select `backend-plugin`; the package lives in `plugins/<id>-backend/`.
- Define the plugin with `createBackendPlugin`, declare dependencies via `deps`, and initialize in `register(env).registerInit`.
- Attach routes through `coreServices.httpRouter`. Backstage prefixes plugin routers with `/api/<pluginId>`.
- Backends are secure by default; use `httpRouter.addAuthPolicy({ path, allow })` to allow unauthenticated endpoints.
- `allow` on `addAuthPolicy` only accepts `'unauthenticated'` or `'user-cookie'`.
- Core services (`logger`, `database`, `httpRouter`, `httpAuth`, `auth`, `userInfo`, `urlReader`, `scheduler`, `cache`, `permissions`, etc.) are available via `coreServices`.
- Validate inputs with `zod` and throw `InputError` from `@backstage/errors`. Let the root HTTP router handle error responses — you usually don't need per-router error middleware.
- A **module** (`createBackendModule`) extends another plugin via its extension points. A plugin exposes extension points with `env.registerExtensionPoint(...)`.

---

## Production Best Practices

### Request Validation

Validate inputs at the edge using `zod`. Throw `InputError` (from `@backstage/errors`) on failure so the root error handler can serialize it as a 400 response — no need to write the response yourself:

```ts
import { InputError } from '@backstage/errors';
import { z } from 'zod/v3';

const querySchema = z.object({ q: z.string().min(1) });

router.get('/search', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new InputError(parsed.error.toString());
  }
  const results = await search(parsed.data.q);
  res.json({ items: results });
});
```

Use `zod/v3` (or `zod/v4` — both are available in the repo today) to pin behaviour across the codebase. Recent scaffolded plugins use `zod/v3`.

### Error Handling

The root HTTP router installs a centralized error middleware, so individual plugin routers don't need to add their own. If you need to customize error formatting at the root level, use `MiddlewareFactory` from `@backstage/backend-defaults/rootHttpRouter`:

```ts
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';

// Typically only set up once in tests or at the root.
const middleware = MiddlewareFactory.create({ config, logger });
router.use(middleware.error({ logAllErrors: false }));
```

> The legacy helper `errorHandler` from `@backstage/backend-common` has been removed. Use `MiddlewareFactory.create(...).error()`, or `mockErrorHandler` from `@backstage/backend-test-utils` in tests.

Wrap async handlers with `express-promise-router` so thrown errors reach the error middleware automatically — that's what the scaffolded template does.

### Auth and Identity

- Backends are secure-by-default
- Open specific paths explicitly with `httpRouter.addAuthPolicy({ path, allow: 'unauthenticated' })`
- For protected routes, extract credentials with `httpAuth`
- Derive user/entity identity via `userInfo` when required
- Use `auth` to issue on-behalf-of tokens for calls to other plugins

```ts
router.get('/me', async (req, res) => {
  const credentials = await httpAuth.credentials(req, { allow: ['user'] });
  const { userEntityRef, ownershipEntityRefs } = await userInfo.getUserInfo(credentials);
  res.json({ userEntityRef, ownershipEntityRefs });
});
```

### Database Usage

- `const knex = await database.getClient();` gets a per-plugin Knex client (separate schema per plugin)
- Keep queries in small repo/service modules
- Write migrations in JavaScript (`.js`) and include them in your package's `files` list
- Run migrations via `knex.migrate.latest({ directory, migrationSource })` during `init`

### Observability & Scalability

- Avoid in-memory state — use the `cache` or `database` services so multiple replicas share state
- Make scheduled task handlers idempotent
- Log with `logger.child({ plugin: 'example' })` for traceability
- For auditing, use `coreServices.auditor` to emit structured audit events

---

## Golden Path (Copy/Paste Workflow)

### 1) Scaffold

```bash
# From the repository root (interactive)
yarn new
# Select: backend-plugin
# Plugin id (without -backend suffix), e.g. example

# Non-interactive (for AI agents/automation)
yarn new --select backend-plugin --option pluginId=example --option owner=""
```

This creates `plugins/example-backend/` using the New Backend System. The scaffolded structure is:

- `src/plugin.ts` — `createBackendPlugin` wiring
- `src/router.ts` — Express router (uses `express-promise-router`)
- `src/services/` — service refs + implementations
- `src/index.ts` — re-exports the plugin as default
- `dev/index.ts` — local dev backend via `createBackend`
- `src/plugin.test.ts` — integration tests using `startTestBackend` + `supertest`

### 2) `src/plugin.ts` — plugin + DI + router

The scaffolded shape wires in a service ref (e.g. `todoListServiceRef`) alongside core services:

```ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { todoListServiceRef } from './services/TodoListService';

export const examplePlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        todoList: todoListServiceRef,
      },
      async init({ httpAuth, httpRouter, todoList }) {
        httpRouter.use(await createRouter({ httpAuth, todoList }));

        // Backends are secure-by-default. Open specific endpoints explicitly:
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
      },
    });
  },
});
```

Add more core services to `deps` as you need them (e.g. `logger`, `database`, `userInfo`, `auth`, `scheduler`).

### 3) `src/index.ts` — default export

```ts
export { examplePlugin as default } from './plugin';
```

> Keep this line **only** in `index.ts`. Don't duplicate it inside `plugin.ts`.

### 4) `src/router.ts` — minimal Express router

Use `express-promise-router` so thrown errors propagate to the root error handler. Validate request bodies with `zod`. Check user credentials inline with `httpAuth.credentials`:

```ts
import type { HttpAuthService } from '@backstage/backend-plugin-api';
import { InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { z } from 'zod/v3';
import type { todoListServiceRef } from './services/TodoListService';

export async function createRouter({
  httpAuth,
  todoList,
}: {
  httpAuth: HttpAuthService;
  todoList: typeof todoListServiceRef.T;
}): Promise<express.Router> {
  const router = Router();
  router.use(express.json());

  const todoSchema = z.object({
    title: z.string(),
    entityRef: z.string().optional(),
  });

  router.post('/todos', async (req, res) => {
    const parsed = todoSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new InputError(parsed.error.toString());
    }
    const result = await todoList.createTodo(parsed.data, {
      credentials: await httpAuth.credentials(req, { allow: ['user'] }),
    });
    res.status(201).json(result);
  });

  router.get('/todos', async (_req, res) => {
    res.json(await todoList.listTodos());
  });

  router.get('/todos/:id', async (req, res) => {
    res.json(await todoList.getTodo({ id: req.params.id }));
  });

  return router;
}
```

### 5) Add to your backend

In `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
backend.add(import('@internal/plugin-example-backend'));
backend.start();
```

Now `GET http://localhost:7007/api/example/todos` returns an empty list. `addAuthPolicy` allowed `/health` through unauthenticated; every other path requires a valid user or service credential.

### 6) Services, DB, auth, identity (when needed)

- **Service refs**: define with `createServiceRef<T>({ id: 'example.todoList' })`, register with `createServiceFactory({ service, deps, factory })`. Pattern in the scaffold: `services/TodoListService.ts` exports the ref plus `todoListServiceFactory` which is registered via the plugin's `register(env)`.
- **Database**: depend on `coreServices.database` to get a Knex client; run your own migrations with `knex.migrate.latest(...)` in `init`.
- **Identity**: use `coreServices.httpAuth` + `coreServices.userInfo` to obtain the calling user and their entity refs.
- **Inter-plugin calls**: use `coreServices.auth` to mint a token on behalf of the current caller, then `coreServices.discovery` for the target plugin's base URL — see Core Services reference.
- **Full catalog of core services**: see [⚙️ Core Services Reference](./reference/core_services.md).

---

## Modules and extension points

Modules are packages that extend an existing plugin at a pre-defined integration point. Use them to add processors, providers, actions, etc., without forking the plugin.

**Exposing an extension point (in a plugin):**

```ts
import {
  createBackendPlugin,
  createExtensionPoint,
} from '@backstage/backend-plugin-api';

interface ExampleProcessor {
  process(value: string): Promise<string>;
}

export interface ExampleProcessingExtensionPoint {
  addProcessor(p: ExampleProcessor): void;
}

export const exampleProcessingExtensionPoint =
  createExtensionPoint<ExampleProcessingExtensionPoint>({
    id: 'example.processing',
  });

export const examplePlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    const processors: ExampleProcessor[] = [];

    env.registerExtensionPoint(exampleProcessingExtensionPoint, {
      addProcessor(p) {
        processors.push(p);
      },
    });

    env.registerInit({
      deps: { /* ... */ },
      async init() {
        // Use `processors` during plugin setup.
      },
    });
  },
});
```

**Extending a plugin (in a module):**

```ts
import { createBackendModule } from '@backstage/backend-plugin-api';
import { exampleProcessingExtensionPoint } from '@example/plugin-example-node';

export const exampleModuleCustomProcessor = createBackendModule({
  pluginId: 'example',
  moduleId: 'custom-processor',
  register(env) {
    env.registerInit({
      deps: { example: exampleProcessingExtensionPoint },
      async init({ example }) {
        example.addProcessor(new MyCustomProcessor());
      },
    });
  },
});

// src/index.ts
export { exampleModuleCustomProcessor as default } from './module';
```

Scaffold a module with `yarn new` → `backend-module`. Generated packages live in `plugins/<pluginId>-backend-module-<moduleId>/`.

---

## Verify in a Backstage backend

- Add the plugin to `packages/backend/src/index.ts` via `backend.add(import('@internal/plugin-<id>-backend'))`.
- Start the repo (`yarn start`). Then check:
  - `GET http://localhost:7007/api/example/health` → `{ "status": "ok" }` (if your plugin exposes a `/health` endpoint and opens it with `addAuthPolicy`).
  - If you get a 401, the request hit an authenticated endpoint without a valid token — either authenticate, or open the path with `addAuthPolicy`.

## Testing, linting & structure checks

```bash
# Always pass --watchAll=false when running non-interactively (CI, AI agents);
# without it jest starts in watch mode and never exits.
yarn backstage-cli package test --watchAll=false
yarn backstage-cli package lint
yarn backstage-cli repo lint
```

Keep routers small (`/router.ts`), inject dependencies (DB, auth, clients) from `plugin.ts`, and avoid in-memory state so the backend stays horizontally scalable.

---

## Common Pitfalls (and Fixes)

| Problem | Solution |
| ------- | -------- |
| **404s under `/api`** | Backstage prefixes plugin routers with `/api/<pluginId>`. Don't add the prefix yourself in your route definitions. |
| **Auth unexpectedly required** | Backends are secure by default; open endpoints explicitly via `httpRouter.addAuthPolicy({ path, allow: 'unauthenticated' })`. |
| **Tight coupling between plugins** | Never import other backend plugins' internals. Communicate over HTTP using `discovery` + `auth` (`auth.getPluginRequestToken({ onBehalfOf, targetPluginId })`), or use extension points/modules. |
| **`errorHandler` not found** | `@backstage/backend-common` has been removed. Use `MiddlewareFactory.create({ config, logger }).error()` from `@backstage/backend-defaults/rootHttpRouter`, or rely on the root error handler that's installed automatically. |
| **Tests hang or timeout** | Make sure `startTestBackend` is awaited, and use `await request(server).get(...)` (from `supertest`), **not** `server.request(...)`. |
| **MSW handlers stop matching** | MSW v2 uses `http.get(url, () => HttpResponse.json(...))`, not `rest.get`. Update imports and handler signatures. |
| **Migrations don't run in prod** | Migrations must be `.js` files listed in your `package.json` `files` array, so they're copied into the published artifact. |

---

# Reference Files

## 📚 Documentation Library

Load these resources as needed during development:

### Core Services
- [⚙️ Core Services Reference](./reference/core_services.md) - Complete guide to all core backend services including:
  - HTTP Router / Root HTTP Router for route registration
  - Logger / Root Logger for structured logging
  - Database Service for Knex-based data access
  - HTTP Auth + User Info + Auth services
  - Cache, Scheduler, URL Reader, Discovery services
  - Permissions + Permissions Registry for authorization
  - Auditor, Lifecycle, Root Config, Root Health, Plugin Metadata
  - Service composition examples and best practices

### Testing
- [✅ Testing Reference](./reference/testing.md) - Comprehensive testing guide including:
  - Testing backend plugins with `startTestBackend`
  - The `mockServices` catalog and `mockCredentials` helpers
  - Testing routers with `supertest` (using `await request(server).get(...)`)
  - Testing authentication, permissions, and scheduled tasks
  - External service mocking with **MSW v2**
  - Database testing with `TestDatabases` (from `@backstage/backend-test-utils`)
  - Service factory testing, module testing, and integration patterns

---

## External References

- [Backend Plugins and Modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/) — authoring plugins and modules.
- [Core Backend Services](https://backstage.io/docs/backend-system/core-services/) — index of all core services.
- [Testing Backend Plugins](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing/) — official testing guide.
- [Migrating Backends](https://backstage.io/docs/backend-system/building-backends/migrating/) — legacy-to-new-system migration (covers `errorHandler` → `MiddlewareFactory`).
