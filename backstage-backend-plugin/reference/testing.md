# Backend Plugin Testing Reference

## Overview

Comprehensive testing ensures backend plugins and modules work correctly and helps catch issues before production. Backstage provides specialized testing utilities in the `@backstage/backend-test-utils` package for creating test backends, mocking services, simulating authenticated requests, and running tests against real database engines.

---

## Testing Setup

### Install Dependencies

```json
{
  "devDependencies": {
    "@backstage/backend-test-utils": "^1.11.0",
    "msw": "^2.0.0",
    "supertest": "^7.0.0"
  }
}
```

Notes:
- `@backstage/test-databases` is **not** a real package. `TestDatabases` lives in `@backstage/backend-test-utils` — just import it from there.
- MSW v2 is used by new code in the Backstage repo. Older code still uses v1 (`rest.get`), so when touching existing plugin tests check their `package.json` first and match the local version.

### Test File Structure

Organize tests alongside source files:

```
src/
├── router.ts
├── router.test.ts
├── services/
│   ├── TodoListService.ts
│   └── TodoListService.test.ts
└── plugin.test.ts
```

---

## Testing Backend Plugins

### Basic Plugin Testing

Use `startTestBackend` to spin up a full backend harness with mock services, then drive it with `supertest`. The request helper is `await request(server).get(...)`, not `server.request(...)`:

```ts
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { examplePlugin } from './plugin';

describe('examplePlugin', () => {
  it('serves a health endpoint', async () => {
    const { server } = await startTestBackend({
      features: [examplePlugin],
    });

    await request(server).get('/api/example/health').expect(200, { status: 'ok' });
  });

  it('reads configuration', async () => {
    const fakeConfig = { example: { apiKey: 'test-key' } };
    const mockLogger = mockServices.logger.mock();

    const { server } = await startTestBackend({
      features: [
        examplePlugin,
        mockServices.rootConfig.factory({ data: fakeConfig }),
        mockLogger.factory,
      ],
    });

    const response = await request(server).get('/api/example/config-value');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ value: 'test-key' });
    expect(mockLogger.info).toHaveBeenCalledWith('Starting examplePlugin');
  });
});
```

The returned `server` also has a `.port()` method for low-level network interactions when `supertest` isn't enough.

---

## Mock Services

### Available Mock Services

Import mocks for every core service via `mockServices` and pass them as features to `startTestBackend`:

```ts
import { mockServices } from '@backstage/backend-test-utils';

const { server } = await startTestBackend({
  features: [
    examplePlugin,
    mockServices.logger.factory(),
    mockServices.database.factory(),
    mockServices.cache.factory(),
    mockServices.rootConfig.factory({ data: {} }),
  ],
});
```

Available mocks (current, full list): `auth`, `auditor`, `cache`, `database`, `discovery`, `events`, `httpAuth`, `httpRouter`, `lifecycle`, `logger`, `permissions`, `permissionsRegistry`, `rootConfig`, `rootHealth`, `rootHttpRouter`, `rootInstanceMetadata`, `rootLifecycle`, `rootLogger`, `scheduler`, `urlReader`, `userInfo`.

Each mock exposes two variants:
- `.factory(options?)` — service factory to pass in `features`.
- `.mock(partialImpl?)` — a mock instance whose methods are `jest.fn()`. Configure them in your tests with `.mockResolvedValue(...)`, `.mockReturnValue(...)`, etc.

### Mock Logger

Capture log output for assertions:

```ts
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';

describe('logging', () => {
  it('logs important events', async () => {
    const mockLogger = mockServices.logger.mock();

    const { server } = await startTestBackend({
      features: [examplePlugin, mockLogger.factory],
    });

    await request(server).post('/api/example/process');

    expect(mockLogger.info).toHaveBeenCalledWith('Processing started');
  });
});
```

### Mock Configuration

```ts
const mockConfig = mockServices.rootConfig.factory({
  data: {
    example: {
      apiUrl: 'https://test.example.com',
      timeout: 5000,
      retries: 3,
    },
  },
});

const { server } = await startTestBackend({
  features: [examplePlugin, mockConfig],
});
```

### Mock Database

Use in-memory SQLite (via `better-sqlite3`) for fast tests:

```ts
const { server } = await startTestBackend({
  features: [
    examplePlugin,
    mockServices.database.factory(),
  ],
});
```

### Mock Auth and Credentials

`mockCredentials` produces principals that test routes can check against:

```ts
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import request from 'supertest';

describe('authenticated routes', () => {
  it('records who created the todo', async () => {
    const { server } = await startTestBackend({ features: [examplePlugin] });

    const res = await request(server)
      .post('/api/example/todos')
      .send({ title: 'My Todo' });

    expect(res.status).toBe(201);
    expect(res.body.createdBy).toBe(mockCredentials.user().principal.userEntityRef);
  });
});
```

By default, `startTestBackend` attaches mock user credentials to every request so your `httpAuth.credentials(req, { allow: ['user'] })` calls succeed. If you want to test the unauthenticated path, configure the `httpAuth` mock to reject credentials or disable the default credentials injection.

**Partial implementations** — pass a partial object to `.mock(...)` to override specific methods:

```ts
const httpAuthMock = mockServices.httpAuth.mock();
httpAuthMock.credentials.mockRejectedValue(new Error('Unauthorized'));
```

---

## Testing Routers

### With the test backend + supertest

The preferred pattern is to exercise your router through the full plugin wiring:

```ts
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import request from 'supertest';
import { examplePlugin } from './plugin';

describe('router', () => {
  it('validates the request body', async () => {
    const { server } = await startTestBackend({ features: [examplePlugin] });

    const response = await request(server)
      .post('/api/example/todos')
      .send({ invalid: 'data' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { name: 'InputError' } });
  });
});
```

### Standalone router testing (for granular unit tests)

When you want to unit-test a router in isolation without booting a backend, construct one directly and give it mocked services:

```ts
import { mockServices, mockErrorHandler } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';

describe('router unit', () => {
  let app: express.Express;

  beforeEach(async () => {
    const router = await createRouter({
      logger: mockServices.logger.mock(),
      database: mockServices.database.mock(),
      httpAuth: mockServices.httpAuth.mock(),
      userInfo: mockServices.userInfo.mock(),
    });

    app = express();
    app.use(router);
    app.use(mockErrorHandler()); // mimic the root error handler
  });

  it('returns health status', async () => {
    await request(app).get('/health').expect(200);
  });
});
```

`mockErrorHandler` replaces the legacy `errorHandler` from `@backstage/backend-common`. Use it so thrown errors (like `InputError`, `NotFoundError`) are serialized the way production does.

---

## Testing External Services

### Using MSW v2

Intercept outgoing HTTP requests and return mock responses. The v2 API is `http.get/post/...` + `HttpResponse`:

```ts
import { registerMswTestHooks, startTestBackend } from '@backstage/backend-test-utils';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import request from 'supertest';

describe('external API integration', () => {
  const worker = setupServer();
  registerMswTestHooks(worker);

  it('fetches data from the external API', async () => {
    worker.use(
      http.get('https://api.example.com/data/:id', ({ params }) =>
        HttpResponse.json({ id: params.id, name: 'Test Data' }),
      ),
    );

    const { server } = await startTestBackend({ features: [examplePlugin] });

    const response = await request(server).get('/api/example/fetch/123');
    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Test Data');
  });

  it('propagates external errors', async () => {
    worker.use(
      http.get('https://api.example.com/data/:id', () =>
        HttpResponse.json({ error: 'Server Error' }, { status: 500 }),
      ),
    );

    const { server } = await startTestBackend({ features: [examplePlugin] });

    const response = await request(server).get('/api/example/fetch/123');
    expect(response.status).toBe(500);
  });
});
```

`registerMswTestHooks` automatically wires `beforeAll`/`afterEach`/`afterAll` and enables `onUnhandledRequest: 'error'` so you catch accidental network calls.

---

## Database Testing

### Using Test Databases

`TestDatabases` (from `@backstage/backend-test-utils` — **not** a separate `test-databases` package) spins up real database engines via `testcontainers` for tests that need SQL fidelity:

**How engines are provided**: for each engine, `TestDatabases` first checks a connection-string environment variable (e.g. `BACKSTAGE_TEST_DATABASE_POSTGRES16_CONNECTION_STRING`) and uses that server if set; otherwise it starts a throwaway container via testcontainers. Locally the testcontainers fallback works if Docker is running. In CI, always provide the connection string via a service container (see CI/CD Integration below): the testcontainers path loads native modules that can crash jest workers with SIGSEGV on Linux runners, and the service-container pattern is what Backstage core's own CI uses.

```ts
import {
  TestDatabaseId,
  TestDatabases,
} from '@backstage/backend-test-utils';
import { MyDatabaseClass } from './MyDatabaseClass';

describe('MyDatabaseClass', () => {
  // Only set up the databases you actually need; each is a real Docker container.
  const databases = TestDatabases.create({
    ids: ['POSTGRES_14', 'SQLITE_3'],
  });

  async function createSubject(databaseId: TestDatabaseId) {
    const knex = await databases.init(databaseId);
    const subject = new MyDatabaseClass({ database: knex });
    await subject.runMigrations();
    return { knex, subject };
  }

  it.each(databases.eachSupportedId())(
    'stores and reads foos on %p',
    async databaseId => {
      const { knex, subject } = await createSubject(databaseId);
      await knex('foos').insert({ value: 2 });
      await expect(subject.foos()).resolves.toEqual([{ value: 2 }]);
    },
    60_000, // container spin-up can take a while
  );
});
```

Supported database ids include SQLite, Postgres (multiple versions), and MySQL. `databases.eachSupportedId()` iterates over every id registered in `create`.

### Repository Testing

```ts
import { mockServices } from '@backstage/backend-test-utils';
import { UserRepository } from './UserRepository';

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeEach(async () => {
    const database = mockServices.database.mock();
    repository = new UserRepository(database);
    const knex = await database.getClient();
    await knex.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('email').notNullable().unique();
      table.string('name').notNullable();
    });
  });

  it('creates, finds, and enforces uniqueness', async () => {
    const user = await repository.create({ email: 'test@example.com', name: 'Test User' });
    expect(user.id).toBeDefined();

    const found = await repository.findByEmail('test@example.com');
    expect(found?.name).toBe('Test User');

    await expect(
      repository.create({ email: 'test@example.com', name: 'Another User' }),
    ).rejects.toThrow();
  });
});
```

---

## Service Factory Testing

Test custom service factories in isolation with `ServiceFactoryTester`:

```ts
import {
  ServiceFactoryTester,
  mockServices,
} from '@backstage/backend-test-utils';
import { myServiceFactory } from './service';

describe('myServiceFactory', () => {
  it('creates a working service', async () => {
    const tester = ServiceFactoryTester.from(myServiceFactory, {
      dependencies: [
        mockServices.logger.factory(),
        mockServices.database.factory(),
      ],
    });

    const service = await tester.get();
    const result = await service.doSomething();
    expect(result).toBeDefined();
  });
});
```

---

## Testing Modules

Modules are exercised by booting them with `startTestBackend` alongside the plugin they extend (or by registering a stub for the extension point they target):

```ts
import { startTestBackend } from '@backstage/backend-test-utils';
import { catalogPlugin } from '@backstage/plugin-catalog-backend';
import { exampleModuleCustomProcessor } from './module';

it('registers the custom processor on the catalog', async () => {
  const { server } = await startTestBackend({
    features: [catalogPlugin, exampleModuleCustomProcessor],
  });
  // Drive the catalog and assert your processor ran.
});
```

---

## Integration Testing

### Full Backend Testing

Test multiple plugins together:

```ts
import { startTestBackend } from '@backstage/backend-test-utils';
import { catalogPlugin } from '@backstage/plugin-catalog-backend';
import { examplePlugin } from './plugin';
import request from 'supertest';

it('looks up entities via the catalog', async () => {
  const { server } = await startTestBackend({
    features: [examplePlugin, catalogPlugin],
  });

  // Seed the catalog, then exercise the example plugin against it.
  const response = await request(server).get('/api/example/component/test');
  expect(response.status).toBe(200);
});
```

For catalog interactions in particular, you can also stub the catalog with `catalogServiceMock.factory(...)` from `@backstage/plugin-catalog-node/testUtils` instead of spinning up the real plugin — that's what the `yarn new` scaffolded tests do.

---

## Best Practices

### Test Organization

Prefer a small number of thorough tests with multiple assertions per test over many tiny tests — this is both faster to run and easier to maintain:

```ts
describe('examplePlugin', () => {
  it('supports the full CRUD lifecycle', async () => {
    const { server } = await startTestBackend({ features: [examplePlugin] });

    // Create
    const createRes = await request(server).post('/api/example/todos').send({ title: 'x' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // Read
    await request(server).get(`/api/example/todos/${id}`).expect(200);

    // Update, delete, and so on…
  });
});
```

### Async Cleanup

`startTestBackend` manages its own lifecycle — you typically don't need to stop the server manually. If your tests start additional resources (timers, interval tasks), clean them up in `afterEach`.

### Mock Reset

```ts
beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});
```

### Error Testing

Use `supertest` to assert error status and the shape of the error body produced by the root handler:

```ts
it('returns 400 for invalid input', async () => {
  const { server } = await startTestBackend({ features: [examplePlugin] });

  const response = await request(server).post('/api/example/todos').send({ invalid: 'schema' });
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({ error: { name: 'InputError' } });
});
```

---

## Running Tests

### Command Line

From the plugin directory:

```bash
# Run all tests (--watchAll=false prevents jest watch mode, which never exits in CI/agents)
yarn backstage-cli package test --watchAll=false
yarn backstage-cli package test --watch
yarn backstage-cli package test --coverage --watchAll=false
yarn backstage-cli package test router.test.ts --watchAll=false
yarn backstage-cli package test --testNamePattern="authentication" --watchAll=false
```

From the repo root:

```bash
CI=1 yarn test <path>
```

Always pass a path — never run the full suite.

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Backend Plugin
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      # Provides postgres for TestDatabases via the connection-string env var
      # below. Without the env var, TestDatabases falls back to testcontainers,
      # which can SIGSEGV jest workers on Linux runners.
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: yarn install --immutable
      - run: yarn backstage-cli package test --coverage
        env:
          BACKSTAGE_TEST_DATABASE_POSTGRES16_CONNECTION_STRING: postgresql://postgres:postgres@localhost:5432
```

---

## Common Testing Patterns

### Testing Scheduled Tasks

Capture the function passed to `scheduler.scheduleTask` and invoke it manually:

```ts
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';

it('runs the cleanup task', async () => {
  const mockScheduler = mockServices.scheduler.mock();
  let taskFn: (() => Promise<void>) | undefined;
  mockScheduler.scheduleTask.mockImplementation(async ({ fn }) => {
    taskFn = fn as () => Promise<void>;
    return { unschedule: jest.fn() };
  });

  await startTestBackend({ features: [examplePlugin, mockScheduler.factory] });

  expect(taskFn).toBeDefined();
  await taskFn!();
  // Assert the side effects of the cleanup task here.
});
```

### Testing Pagination

```ts
it('paginates the todo list', async () => {
  const { server } = await startTestBackend({ features: [examplePlugin] });

  for (let i = 0; i < 50; i++) {
    await request(server).post('/api/example/todos').send({ title: `Item ${i}` });
  }

  const first = await request(server).get('/api/example/todos').query({ limit: 10, offset: 0 });
  expect(first.body.items).toHaveLength(10);
  expect(first.body.total).toBe(50);

  const second = await request(server).get('/api/example/todos').query({ limit: 10, offset: 10 });
  expect(second.body.items[0].title).toBe('Item 10');
});
```

---

## Official Documentation

- [Testing Backend Plugins and Modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/testing/) — canonical guide.
- [Backend Test Utils reference](https://backstage.io/docs/reference/backend-test-utils/) — typed API.
- [MSW v2 docs](https://mswjs.io/) — external-request mocking.
