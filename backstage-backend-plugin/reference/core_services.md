# Core Backend Services Reference

## Overview

Backstage's backend system provides core services through dependency injection. All services are accessed via `coreServices` from `@backstage/backend-plugin-api`. Services handle common backend needs: logging, database access, HTTP routing, authentication, auditing, scheduling, caching, and more.

There are two scopes:
- **Plugin scope** — services are scoped to your plugin (the logger tags entries with your plugin id, the database returns a separate schema, etc.). Most services on `coreServices` are plugin-scoped.
- **Root scope** — services that live at the backend root and are shared across plugins. These are prefixed `root*` (e.g. `rootConfig`, `rootLogger`, `rootHttpRouter`, `rootLifecycle`, `rootHealth`, `rootInstanceMetadata`).

---

## Essential Services

### HTTP Router Service

Manages HTTP route registration for plugins.

**Import**: `coreServices.httpRouter`

**Type**: `HttpRouterService`

**Usage**:

```ts
import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const examplePlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
      },
      async init({ httpRouter }) {
        const router = await createRouter(/* ... */);
        httpRouter.use(router);

        // Open specific paths to unauthenticated access
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
```

**Key Methods**:
- `use(handler)`: add Express middleware/router
- `addAuthPolicy(policy)`: configure authentication requirements for a path

**Auth Policies**:

`addAuthPolicy` accepts `{ path, allow }` where `allow` is one of:
- `'unauthenticated'` — no credentials required
- `'user-cookie'` — allow session cookies (used for endpoints served to browsers that aren't sent via `fetch` with tokens)

There are **only two** valid `allow` values. Any other string is a mistake.

**Important**: Backstage prefixes all plugin routes with `/api/<pluginId>`. A route defined as `/data` in your router becomes `/api/example/data` externally.

---

### Root HTTP Router Service

The backend-wide router, used for endpoints that don't belong to a specific plugin (e.g. a root-level `/healthcheck` or custom top-level paths). Most plugins do not need this — prefer `httpRouter`.

**Import**: `coreServices.rootHttpRouter`

---

### Logger Service

Provides structured logging capabilities.

**Import**: `coreServices.logger`

**Type**: `LoggerService`

**Usage**:

```ts
env.registerInit({
  deps: {
    logger: coreServices.logger,
  },
  async init({ logger }) {
    logger.info('Plugin initialized');
    logger.error('Failed to process request', { userId: '123' });
    logger.debug('Detailed debug info', { metadata: {} });

    // Create child logger with context
    const child = logger.child({ plugin: 'example', component: 'api' });
    child.info('Processing request'); // includes context in output
  },
});
```

**Log Levels**: `debug`, `info`, `warn`, `error`.

**Best Practices**:
- Use child loggers to add context
- Include relevant metadata in structured fields
- Log errors with full context for debugging
- Do not log secrets or personal data

---

### Root Logger Service

The unscoped root logger, available as `coreServices.rootLogger`. Useful for backend-wide setup code; plugins should almost always prefer the plugin-scoped `logger`.

---

### Database Service

Provides database access through Knex.js. Each plugin gets its own schema automatically.

**Import**: `coreServices.database`

**Type**: `DatabaseService`

**Usage**:

```ts
env.registerInit({
  deps: {
    database: coreServices.database,
    logger: coreServices.logger,
  },
  async init({ database, logger }) {
    const knex = await database.getClient();

    // Query data
    const users = await knex('users')
      .where({ active: true })
      .select('id', 'name', 'email');
    logger.info('Found users', { count: users.length });

    // Insert data
    await knex('users').insert({
      name: 'John Doe',
      email: 'john@example.com',
      created_at: knex.fn.now(),
    });
  },
});
```

**Migration Pattern**:

> **Note**: Migrations must be written in JavaScript (`.js`), not TypeScript. Backstage runs Knex migrations at runtime inside your backend service, and the default runtime does not include TypeScript loaders. First-party Backstage plugins ship their migrations as `.js` files under `migrations/`.

```js
// migrations/20251118120000_create_users_table.js
exports.up = async function up(knex) {
  await knex.schema.createTable('users', table => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['email']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('users');
};
```

**Include migrations in the published artifact** by listing them in `package.json`:

```json
{
  "files": [
    "dist",
    "migrations"
  ]
}
```

**Running migrations** — call `knex.migrate.latest({ directory, migrationSource })` during plugin `init`:

```ts
import { resolvePackagePath } from '@backstage/backend-plugin-api';

const migrationsDir = resolvePackagePath('@internal/plugin-example-backend', 'migrations');
const knex = await database.getClient();
await knex.migrate.latest({ directory: migrationsDir });
```

**Best Practices**:
- Always write migrations for schema changes
- Use transactions for multi-step operations
- Index frequently queried columns
- Keep queries in repository/service modules (not inline in route handlers)
- Avoid N+1 queries — use joins or batch loading

---

### HTTP Auth Service

Extracts credentials from incoming requests.

**Import**: `coreServices.httpAuth`

**Type**: `HttpAuthService`

**Usage**:

```ts
router.get('/protected', async (req, res) => {
  const credentials = await httpAuth.credentials(req, {
    allow: ['user', 'service'],
  });

  // Credentials contain the principal (user or service)
  logger.info('Authenticated request', {
    principal: credentials.principal,
  });

  res.json({ message: 'Success' });
});
```

**Principal Types**:
- `'user'` — end-user credentials
- `'service'` — service-to-service token
- `'none'` — anonymous (only reachable if the path has `allow: 'unauthenticated'`)

If you omit `allow`, both `'user'` and `'service'` are accepted. Pass an explicit list when you want to narrow access.

**`allowLimitedAccess`**: If you need to accept limited-scope tokens (e.g. tokens issued for a single action), pass `allowLimitedAccess: true`.

**Authentication Flow**:

```ts
// 1. Extract credentials
const creds = await httpAuth.credentials(req, { allow: ['user'] });

// 2. Get user info (if needed)
const { userEntityRef } = await userInfo.getUserInfo(creds);

// 3. Use in business logic
logger.info('User action', { user: userEntityRef });
```

---

### User Info Service

Retrieves user information from credentials.

**Import**: `coreServices.userInfo`

**Type**: `UserInfoService`

**Usage**:

```ts
router.post('/create', async (req, res) => {
  const credentials = await httpAuth.credentials(req, { allow: ['user'] });
  const { userEntityRef, ownershipEntityRefs } = await userInfo.getUserInfo(credentials);

  const resource = await createResource({
    ...req.body,
    owner: userEntityRef,
  });
  logger.info('Creating resource', { user: userEntityRef, ownershipEntityRefs });

  res.json(resource);
});
```

**UserInfo properties**:
- `userEntityRef` — user entity reference (e.g. `user:default/john.doe`)
- `ownershipEntityRefs` — all entity refs the user belongs to (user + groups)

---

### Auth Service

Issues and verifies tokens. Use this when you need to call another plugin's backend from your backend.

**Import**: `coreServices.auth`

**Type**: `AuthService`

**Usage**:

```ts
env.registerInit({
  deps: {
    auth: coreServices.auth,
    discovery: coreServices.discovery,
    httpAuth: coreServices.httpAuth,
  },
  async init({ auth, discovery /*, httpAuth */ }) {
    // Make a service-to-service call on behalf of the calling user.
    router.get('/proxy-entities', async (req, res) => {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'catalog',
      });
      const baseUrl = await discovery.getBaseUrl('catalog');
      const response = await fetch(`${baseUrl}/entities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      res.json(await response.json());
    });
  },
});
```

**Key methods**:
- `getPluginRequestToken({ onBehalfOf, targetPluginId })` — mint a token for another plugin
- `getOwnServiceCredentials()` — credentials this backend can use to identify itself
- `authenticate(token, options?)` — verify a token
- `isPrincipal(credentials, type)` — narrow a credentials object to a specific principal type
- `getLimitedUserToken(credentials)` — mint a scoped token for a short-lived operation
- `listPublicServiceKeys()` — expose this backend's public keys for other services to verify tokens

---

### Discovery Service

Finds base URLs for backend plugins. Pair this with `auth` for inter-plugin calls.

**Import**: `coreServices.discovery`

```ts
const baseUrl = await discovery.getBaseUrl('catalog');
// Returns something like http://localhost:7007/api/catalog
```

Use discovery instead of hardcoding URLs; in production the host differs from dev and you may be behind a reverse proxy.

---

### Scheduler Service

Runs distributed background tasks with at-most-one semantics (the scheduler coordinates across replicas).

**Import**: `coreServices.scheduler`

**Type**: `SchedulerService`

**Usage**:

```ts
env.registerInit({
  deps: {
    scheduler: coreServices.scheduler,
    logger: coreServices.logger,
  },
  async init({ scheduler, logger }) {
    await scheduler.scheduleTask({
      id: 'cleanup-old-data',
      frequency: { hours: 1 },       // HumanDuration — also accepts seconds/minutes/days
      timeout: { minutes: 15 },      // required — hard cap per run
      initialDelay: { minutes: 2 },  // optional — wait before the first run
      scope: 'global',               // 'global' (default) = one replica at a time; 'local' = every replica
      fn: async () => {
        logger.info('Running cleanup task');
      },
    });

    // Cron expression
    await scheduler.scheduleTask({
      id: 'daily-report',
      frequency: { cron: '0 9 * * *' }, // 9 AM daily
      timeout: { minutes: 30 },
      fn: async () => {
        logger.info('Generating daily report');
      },
    });

    // Manual trigger only — run via scheduler.triggerTask(id)
    await scheduler.scheduleTask({
      id: 'resync-now',
      frequency: { trigger: 'manual' },
      timeout: { minutes: 30 },
      fn: async () => { /* ... */ },
    });
  },
});
```

**`frequency`** accepts any of:
- a `HumanDuration` object such as `{ seconds, minutes, hours, days, weeks, months, years, milliseconds }`
- a cron expression via `{ cron: '…' }`
- `{ trigger: 'manual' }` — only runs when invoked with `scheduler.triggerTask(id)`

**Other methods**:
- `triggerTask(id)` — invoke a task outside its normal schedule
- `cancelTask(id)` — stop a task
- `createScheduledTaskRunner(schedule)` — create a runner you can hand to other code (e.g. catalog processors)
- `getScheduledTasks()` — inspect configured tasks

**Best Practices**:
- Make tasks idempotent — they may retry on replica failures
- Set appropriate `timeout` — tasks that run longer are killed
- Log task execution at start/finish so monitoring picks it up

---

### Cache Service

Key-value cache, backed by an in-memory store in development and a shared store (e.g. Redis) in production — configured by the integrator.

**Import**: `coreServices.cache`

**Usage**:

```ts
env.registerInit({
  deps: { cache: coreServices.cache },
  async init({ cache }) {
    await cache.set('user:123', { name: 'John' }, { ttl: 3_600_000 }); // 1 hour
    const user = await cache.get('user:123');
    await cache.delete('user:123');
  },
});
```

**Methods**: `get`, `set`, `delete`, `withOptions` (returns a cache instance with defaults applied).

Do **not** treat cache as storage — values may disappear at any time. Cache is for performance, not correctness.

---

### URL Reader Service

Reads content from external systems (HTTP, GitHub, GitLab, Bitbucket, Azure DevOps, …) using the integrator's configured credentials.

**Import**: `coreServices.urlReader`

**Usage**:

```ts
// Read a single URL
const response = await urlReader.readUrl('https://example.com/data.json');
const buffer = await response.buffer();
const data = JSON.parse(buffer.toString('utf-8'));

// Read a tree (e.g. a directory in a Git repo)
const tree = await urlReader.readTree('https://github.com/org/repo/tree/main');
const files = await tree.files();
for (const file of files) {
  const content = await file.content();
  // …
}
```

---

### Root Config Service

Static configuration, assembled from `app-config.yaml` + environment + overrides by the integrator.

**Import**: `coreServices.rootConfig`

**Usage**:

```ts
env.registerInit({
  deps: { config: coreServices.rootConfig },
  async init({ config }) {
    const apiKey = config.getString('example.apiKey');
    const timeout = config.getNumber('example.timeout');
    const enabled = config.getBoolean('example.enabled');

    // Optional values
    const optional = config.getOptionalString('example.optional');

    // Nested config
    const settings = config.getConfig('example.settings');
    const nestedValue = settings.getString('nested.key');
  },
});
```

Corresponding YAML:

```yaml
example:
  apiKey: ${EXAMPLE_API_KEY}
  timeout: 5000
  enabled: true
  settings:
    nested:
      key: value
```

---

### Permissions Service

Runtime authorization: ask whether a given action is allowed for a given set of credentials.

**Import**: `coreServices.permissions`

**Usage**:

```ts
import { createPermission } from '@backstage/plugin-permission-common';

export const exampleDeletePermission = createPermission({
  name: 'example.delete',
  attributes: { action: 'delete' },
});

router.delete('/data/:id', async (req, res) => {
  const credentials = await httpAuth.credentials(req, { allow: ['user'] });

  const [decision] = await permissions.authorize(
    [{ permission: exampleDeletePermission }],
    { credentials },
  );

  if (decision.result === 'DENY') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await deleteData(req.params.id);
  res.json({ success: true });
});
```

---

### Permissions Registry Service

Registers the permissions, permission rules, and resource types your plugin exposes to the permission system, so integrators can build policies against them.

**Import**: `coreServices.permissionsRegistry`

**Usage (inside `register`/`init`)**:

```ts
env.registerInit({
  deps: {
    permissionsRegistry: coreServices.permissionsRegistry,
  },
  async init({ permissionsRegistry }) {
    permissionsRegistry.addPermissions([exampleDeletePermission /* ... */]);
    // Optionally: addResourceType, addPermissionRules
  },
});
```

See `plugins/catalog-backend/src/service/CatalogPlugin.ts` and `plugins/scaffolder-backend/src/ScaffolderPlugin.ts` in the Backstage repo for production examples.

---

### Auditor Service

Emits structured audit events for security-relevant actions.

**Import**: `coreServices.auditor`

Use it for actions like "user created resource X", "policy changed", "entitlement granted". The integrator decides how to ingest these events.

---

### Lifecycle Services

- `coreServices.lifecycle` — register per-plugin startup/shutdown hooks (`addStartupHook`, `addShutdownHook`).
- `coreServices.rootLifecycle` — backend-wide hooks.

Use these for long-lived resources that need graceful shutdown (e.g. closing database pools, flushing queues).

---

### Root Health Service

Provides the backend's liveness and readiness signals. Read them via `getLiveness()` / `getReadiness()`.

**Import**: `coreServices.rootHealth`

> There is **no** method to register custom readiness checks on this service. If you need to expose a health endpoint from your plugin, wire a route that returns 200 when your resources are reachable, and include a `httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' })` for it.

---

### Root Instance Metadata Service

Exposes instance-level metadata (e.g. a unique instance id). Rarely needed in plugin code, but useful for logs/metrics correlation.

**Import**: `coreServices.rootInstanceMetadata`

---

### Plugin Metadata Service

Exposes information about the currently-initializing plugin (id, etc.). Mostly used by framework code.

**Import**: `coreServices.pluginMetadata`

---

## Service Composition Example

Combining services in a real plugin:

```ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const examplePlugin = createBackendPlugin({
  pluginId: 'example',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        database: coreServices.database,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        cache: coreServices.cache,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
      },
      async init({
        httpRouter,
        logger,
        database,
        httpAuth,
        userInfo,
        auth,
        cache,
        scheduler,
        config,
      }) {
        const router = await createRouter({
          logger,
          database,
          httpAuth,
          userInfo,
          auth,
          cache,
          config,
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });

        await scheduler.scheduleTask({
          id: 'example-sync',
          frequency: { hours: 6 },
          timeout: { minutes: 30 },
          fn: async () => {
            logger.info('Running scheduled sync');
          },
        });

        logger.info('Example plugin initialized');
      },
    });
  },
});
```

---

## Best Practices

### Service Organization

Keep router creation in a focused file and inject services via options:

```ts
// src/router.ts
import type {
  DatabaseService,
  HttpAuthService,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import express from 'express';
import Router from 'express-promise-router';

export interface RouterOptions {
  logger: LoggerService;
  database: DatabaseService;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
}

export async function createRouter(options: RouterOptions): Promise<express.Router> {
  const { logger, httpAuth, userInfo } = options;
  const router = Router();

  router.get('/data', async (req, res) => {
    const creds = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(creds);
    logger.debug('request', { user: info.userEntityRef });
    res.json({ ok: true });
  });

  return router;
}
```

### Error Handling

The root HTTP router installs a centralized error middleware, so individual plugin routers usually don't need their own. If you do need to customize error formatting, use `MiddlewareFactory`:

```ts
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';

const middleware = MiddlewareFactory.create({ config, logger });
router.use(middleware.error({ logAllErrors: false }));
```

In tests, use `mockErrorHandler` from `@backstage/backend-test-utils`:

```ts
import { mockErrorHandler } from '@backstage/backend-test-utils';

app.use(mockErrorHandler());
```

> The previous `errorHandler` helper from `@backstage/backend-common` has been removed from the repo. Replace any imports with the two options above.

### Horizontal Scalability

Avoid in-memory state across requests:

```ts
// Bad — breaks when you scale to two replicas
const cache = new Map();

// Good — uses the backend's shared cache
const value = await cache.get(key);
```

For background work, use `scheduler.scheduleTask` with `scope: 'global'` (the default) so only one replica runs a given task at a time.

---

## Official Documentation

For complete service references:
- [Core Backend Services](https://backstage.io/docs/backend-system/core-services/) — canonical docs for every service.
- [Backend Plugin API reference](https://backstage.io/docs/reference/backend-plugin-api/) — typed API.
- [Building backends: migrating from the legacy system](https://backstage.io/docs/backend-system/building-backends/migrating/) — covers `errorHandler` → `MiddlewareFactory` and other deprecations.
