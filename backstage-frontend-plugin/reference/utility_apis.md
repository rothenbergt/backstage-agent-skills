# Utility APIs Reference

## Overview

Utility APIs provide shared logic and services across Backstage frontend plugins. They enable dependency injection, service abstraction, and clean separation between presentational components and data access. Utility APIs are the recommended pattern for accessing external services, managing in-app state, and sharing functionality between components.

In the New Frontend System (NFS), import everything related to Utility APIs from `@backstage/frontend-plugin-api`: `createApiRef`, `useApi`, `ApiBlueprint`, and the built-in refs (`discoveryApiRef`, `fetchApiRef`, `identityApiRef`, `storageApiRef`, `alertApiRef`, `errorApiRef`, etc.). They are still re-exported from `@backstage/core-plugin-api` for legacy compatibility, but NFS code should use the `frontend-plugin-api` import path.

---

## Creating a Utility API

### Step 1: Define the API Interface

Create a TypeScript interface that defines the contract:

```tsx
// src/api.ts
export interface ExampleApi {
  /** Fetch data by ID. */
  fetchData(id: string): Promise<Data>;

  /** Update data. */
  updateData(id: string, data: Partial<Data>): Promise<void>;

  /** Subscribe to data changes; returns an unsubscribe function. */
  subscribe(callback: (data: Data) => void): () => void;
}
```

### Step 2: Create the API Reference

Use `createApiRef` to create a unique reference:

```tsx
import { createApiRef } from '@backstage/frontend-plugin-api';

export const exampleApiRef = createApiRef<ExampleApi>({
  id: 'plugin.example.api', // Must be unique across all plugins.
});
```

**Naming Convention**: Use `plugin.<pluginId>.<apiName>` for plugin-specific APIs. The trailing segment disambiguates when a plugin exposes multiple APIs.

### Step 3: Implement the API

Create a default implementation. Dependencies come in via the constructor so tests can substitute them:

```tsx
import type {
  DiscoveryApi,
  FetchApi,
} from '@backstage/frontend-plugin-api';

export class DefaultExampleApi implements ExampleApi {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  async fetchData(id: string): Promise<Data> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('example');
    const response = await this.options.fetchApi.fetch(`${baseUrl}/data/${id}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    return response.json();
  }

  async updateData(id: string, data: Partial<Data>): Promise<void> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl('example');
    const response = await this.options.fetchApi.fetch(`${baseUrl}/data/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to update data: ${response.statusText}`);
    }
  }

  subscribe(callback: (data: Data) => void): () => void {
    const interval = setInterval(async () => {
      // Poll for changes, or use websockets in a real impl.
    }, 5000);
    return () => clearInterval(interval);
  }
}
```

### Step 4: Register with ApiBlueprint

Create an extension using `ApiBlueprint`:

```tsx
// src/plugin.tsx
import {
  ApiBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
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

export const examplePlugin = createFrontendPlugin({
  pluginId: 'example',
  extensions: [exampleApi /* other extensions */],
});
```

The callback parameter is called `defineParams` in every upstream doc and in every real-world plugin. Using that name makes the code consistent with what a reader will find elsewhere in the codebase.

---

## Using Utility APIs

### In React Components

Use the `useApi` hook to access APIs:

```tsx
import { useApi } from '@backstage/frontend-plugin-api';
import { exampleApiRef } from './api';

export function DataComponent({ id }: { id: string }) {
  const exampleApi = useApi(exampleApiRef);
  const [data, setData] = React.useState<Data | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    exampleApi
      .fetchData(id)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [exampleApi, id]);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return null;

  return <div>{data.name}</div>;
}
```

### In Custom Hooks (preferred)

Most Backstage plugin code encapsulates API access in a hook that uses `react-use`'s `useAsync`. This keeps components simple and handles loading/error state for you:

```tsx
import { useApi } from '@backstage/frontend-plugin-api';
import { useAsync } from 'react-use';
import { exampleApiRef } from './api';

export function useExampleData(id: string) {
  const exampleApi = useApi(exampleApiRef);

  const { value, loading, error } = useAsync(
    () => exampleApi.fetchData(id),
    [exampleApi, id],
  );

  return { data: value, loading, error };
}

// Usage in a component
function DataComponent({ id }: { id: string }) {
  const { data, loading, error } = useExampleData(id);

  if (loading) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{data?.name}</div>;
}
```

`react-use` is a standard scaffolded dependency for Backstage frontend plugins; `useAsync` is the idiomatic choice.

---

## Common API Patterns

### REST Client API

Wrap a REST API with type-safe methods:

```tsx
export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

export class DefaultApiClient implements ApiClient {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  private getBaseUrl(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('example');
  }

  async get<T>(path: string): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.options.fetchApi.fetch(`${baseUrl}${path}`);
    if (!response.ok) throw new Error(`GET ${path} failed: ${response.statusText}`);
    return response.json();
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = await this.getBaseUrl();
    const response = await this.options.fetchApi.fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} failed: ${response.statusText}`);
    return response.json();
  }

  // put/delete follow the same pattern
}
```

### Cache API

Implement caching for expensive operations:

```tsx
export interface CacheApi {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): void;
  invalidate(key: string): void;
  clear(): void;
}

export class DefaultCacheApi implements CacheApi {
  private cache = new Map<string, { value: unknown; expires: number }>();

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl = 60_000): void {
    this.cache.set(key, { value, expires: Date.now() + ttl });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Event Bus API

Implement pub/sub patterns:

```tsx
type EventCallback<T> = (event: T) => void;

export interface EventBusApi {
  subscribe<T>(event: string, callback: EventCallback<T>): () => void;
  publish<T>(event: string, data: T): void;
}

export class DefaultEventBusApi implements EventBusApi {
  private listeners = new Map<string, Set<EventCallback<unknown>>>();

  subscribe<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback<unknown>);

    return () => {
      this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
    };
  }

  publish<T>(event: string, data: T): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
}
```

---

## Testing Utility APIs

### Mocking APIs in Tests

Prefer the `apis` option on `renderInTestApp` over manually wrapping with `TestApiProvider`:

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { exampleApiRef } from './api';
import { DataComponent } from './DataComponent';

describe('DataComponent', () => {
  it('displays data from API', async () => {
    const mockApi = {
      fetchData: jest.fn().mockResolvedValue({ id: '123', name: 'Test' }),
      updateData: jest.fn(),
      subscribe: jest.fn(() => () => {}),
    };

    await renderInTestApp(<DataComponent id="123" />, {
      apis: [[exampleApiRef, mockApi]],
    });

    expect(await screen.findByText('Test')).toBeInTheDocument();
    expect(mockApi.fetchData).toHaveBeenCalledWith('123');
  });
});
```

`TestApiProvider` is still available for standalone rendering scenarios where you are not using `renderInTestApp`.

### Creating Test Implementations

For APIs used in many tests, an in-memory test implementation is often more ergonomic than configuring `jest.fn()` in each test:

```tsx
// src/api.test.ts
export class MockExampleApi implements ExampleApi {
  private data = new Map<string, Data>();

  async fetchData(id: string): Promise<Data> {
    const data = this.data.get(id);
    if (!data) throw new Error('Not found');
    return data;
  }

  async updateData(id: string, updates: Partial<Data>): Promise<void> {
    const existing = this.data.get(id);
    if (!existing) throw new Error('Not found');
    this.data.set(id, { ...existing, ...updates });
  }

  subscribe(): () => void {
    return () => {};
  }

  // Test helpers
  setData(id: string, data: Data): void {
    this.data.set(id, data);
  }

  clear(): void {
    this.data.clear();
  }
}
```

---

## Best Practices

### Keep APIs Small and Focused

```tsx
// Good — focused API
export interface UserApi {
  getCurrentUser(): Promise<User>;
  updateProfile(updates: Partial<UserProfile>): Promise<void>;
}

// Bad — too many responsibilities in one ref
export interface EverythingApi {
  getUser(): Promise<User>;
  getEntities(): Promise<Entity[]>;
  sendEmail(): Promise<void>;
  uploadFile(): Promise<void>;
}
```

### Use Dependency Injection

```tsx
// Good — depends on abstractions
class DefaultExampleApi implements ExampleApi {
  constructor(deps: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {}
}

// Bad — creates dependencies internally, hard to test
class BadExampleApi implements ExampleApi {
  private fetch = window.fetch;
}
```

### Handle Errors Meaningfully

Don't swallow errors; prefer specific error messages that help the caller diagnose problems:

```tsx
async fetchData(id: string): Promise<Data> {
  const baseUrl = await this.options.discoveryApi.getBaseUrl('example');
  const response = await this.options.fetchApi.fetch(`${baseUrl}/data/${id}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Data with ID ${id} not found`);
    }
    throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
```

### Provide Type Safety

```tsx
// Good — fully typed
export interface TypedApi {
  fetchData(id: string): Promise<Data>;
  updateData(id: string, data: Partial<Data>): Promise<void>;
}

// Bad — using any
export interface UntypedApi {
  fetchData(id: any): Promise<any>;
  updateData(data: any): Promise<void>;
}
```

---

## Common Core APIs

All of these are re-exported from `@backstage/frontend-plugin-api` — that is the preferred import path in NFS code.

### Discovery API

Find backend plugin base URLs:

```tsx
import { discoveryApiRef, useApi } from '@backstage/frontend-plugin-api';

function Example() {
  const discoveryApi = useApi(discoveryApiRef);
  // ...
  // discoveryApi.getBaseUrl('catalog') resolves to e.g. http://localhost:7007/api/catalog
}
```

### Fetch API

Make authenticated HTTP requests. The fetch API automatically attaches the current user's Backstage token, so backend plugins receive it:

```tsx
import { fetchApiRef, useApi } from '@backstage/frontend-plugin-api';

function Example() {
  const fetchApi = useApi(fetchApiRef);
  // fetchApi.fetch(url, options) — same signature as window.fetch
}
```

### Identity API

Get user information:

```tsx
import { identityApiRef, useApi } from '@backstage/frontend-plugin-api';

async function load(identityApi: ReturnType<typeof useApi<typeof identityApiRef>>) {
  const { userEntityRef } = await identityApi.getBackstageIdentity();
  // Returns e.g. "user:default/john.doe"
}
```

### Storage API

Persist data locally:

```tsx
import { storageApiRef, useApi } from '@backstage/frontend-plugin-api';

function Example() {
  const storageApi = useApi(storageApiRef);
  const bucket = storageApi.forBucket('example');

  bucket.set('key', { value: 'data' });
  // Read with await bucket.get('key')
  // Observe with bucket.observe$('key').subscribe(change => ...)
}
```

### Alert & Error APIs

Show user-facing notifications and report errors to the integrators' chosen handler:

```tsx
import {
  alertApiRef,
  errorApiRef,
  useApi,
} from '@backstage/frontend-plugin-api';

function Example() {
  const alertApi = useApi(alertApiRef);
  const errorApi = useApi(errorApiRef);

  alertApi.post({ message: 'Saved successfully', severity: 'success' });
  errorApi.post(new Error('Something went wrong'));
}
```

---

## Official Documentation

For comprehensive API documentation:
- [Utility APIs — Architecture](https://backstage.io/docs/frontend-system/architecture/utility-apis/)
- [Utility APIs — Guides](https://backstage.io/docs/frontend-system/utility-apis/)
- [Frontend Plugin API reference](https://backstage.io/docs/reference/frontend-plugin-api/)
