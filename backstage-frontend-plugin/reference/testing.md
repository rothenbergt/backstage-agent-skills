# Frontend Plugin Testing Reference

## Overview

Comprehensive testing ensures frontend plugins work correctly and helps catch issues before production. Backstage provides specialized testing utilities in the `@backstage/frontend-test-utils` package for rendering components, exercising extensions, and mocking Utility APIs.

This reference targets Backstage's **New Frontend System** (NFS).

---

## Testing Setup

### Install Dependencies

```json
{
  "devDependencies": {
    "@backstage/frontend-test-utils": "^0.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/user-event": "^14.0.0"
  }
}
```

The Backstage repo is on React 18 at the time of writing, so `@testing-library/react` ^16 is the correct peer. `React.use` and other React 19 features are not yet available.

### Test File Structure

Organize tests alongside source files:

```
src/
├── components/
│   ├── ExamplePage.tsx
│   └── ExamplePage.test.tsx
├── api/
│   ├── ExampleApi.ts
│   └── ExampleApi.test.ts
└── plugin.test.ts
```

---

## Testing React Components

### Basic Component Testing

Use `renderInTestApp` to render components with proper Backstage context. Prefer `screen` + `findBy*` for assertions on async content:

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { ExampleComponent } from './ExampleComponent';

describe('ExampleComponent', () => {
  it('renders content correctly', async () => {
    await renderInTestApp(<ExampleComponent />);

    expect(await screen.findByText('Hello World')).toBeInTheDocument();
  });
});
```

### Mocking Utility APIs

Pass overrides via the `apis` option of `renderInTestApp`. `mockApis.*` provides prebuilt mocks for common core APIs:

```tsx
import {
  mockApis,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { catalogApiMock } from '@backstage/plugin-catalog-react/testUtils';
import { screen } from '@testing-library/react';
import { MyEntitiesList } from './MyEntitiesList';

describe('MyEntitiesList', () => {
  it('renders entities owned by the current user', async () => {
    await renderInTestApp(<MyEntitiesList />, {
      apis: [
        [
          identityApiRef,
          mockApis.identity({ userEntityRef: 'user:default/guest' }),
        ],
        [
          catalogApiRef,
          catalogApiMock({
            entities: [
              {
                apiVersion: 'backstage.io/v1alpha1',
                kind: 'Component',
                metadata: { name: 'my-component' },
                spec: { type: 'service', owner: 'user:default/guest' },
              },
            ],
          }),
        ],
      ],
    });

    expect(await screen.findByText('my-component')).toBeInTheDocument();
  });
});
```

`TestApiProvider` from `@backstage/frontend-test-utils` is still available for the rare case where you need to wrap a subtree manually without going through `renderInTestApp`.

### Testing User Interactions

Use `@testing-library/user-event` for realistic user interactions:

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from './SearchForm';

describe('SearchForm', () => {
  it('submits the entered query', async () => {
    const onSubmit = jest.fn();
    const user = userEvent.setup();

    await renderInTestApp(<SearchForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Search'), 'test query');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSubmit).toHaveBeenCalledWith('test query');
  });
});
```

---

## Testing Extensions

### Single Extension

Use `createExtensionTester` to get access to the React element produced by an extension, then render it through `renderInTestApp`:

```tsx
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { examplePage } from './plugin';

describe('examplePage extension', () => {
  it('renders the page content', async () => {
    await renderInTestApp(
      createExtensionTester(examplePage).reactElement(),
    );

    expect(await screen.findByText('Example Page')).toBeInTheDocument();
  });
});
```

The tester exposes:
- `.reactElement()` — returns the React element from `coreExtensionData.reactElement` (most common).
- `.get(dataRef)` — read any output data the extension produces.
- `.query(extension)` — get another extension's output after wiring.
- `.snapshot()` — full snapshot of the extension tree for debugging.
- `.add(extension, opts?)` — attach another extension to this tester (see below).

### API overrides on the tester

Pass `apis` directly to `createExtensionTester` when you need API mocks for the extension under test:

```tsx
import {
  createExtensionTester,
  mockApis,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { screen } from '@testing-library/react';
import { examplePage } from './plugin';

describe('examplePage extension', () => {
  it('renders with a custom identity', async () => {
    await renderInTestApp(
      createExtensionTester(examplePage, {
        apis: [
          [
            identityApiRef,
            mockApis.identity({ userEntityRef: 'user:default/guest' }),
          ],
        ],
      }).reactElement(),
    );

    expect(await screen.findByText('Example Page')).toBeInTheDocument();
  });
});
```

### Multiple Extensions

Exercise interactions between extensions (e.g. a parent page with sub-pages, or a page whose contents come from another plugin's extension) by chaining `.add(...)`:

```tsx
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { examplePage, exampleOverviewTab } from './plugin';

describe('examplePage with overview tab', () => {
  it('renders the overview tab inside the page', async () => {
    const tester = createExtensionTester(examplePage).add(exampleOverviewTab);

    await renderInTestApp(tester.reactElement());

    expect(await screen.findByRole('tab', { name: 'Overview' })).toBeInTheDocument();
  });
});
```

---

## Testing Configuration

Extensions with config schemas can be tested under different configurations by passing `config` to the tester:

```tsx
import {
  createExtensionTester,
  renderInTestApp,
} from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { examplePage } from './plugin';

describe('examplePage config', () => {
  it('respects custom path', async () => {
    const tester = createExtensionTester(examplePage, {
      config: { path: '/custom-example' },
    });

    await renderInTestApp(tester.reactElement(), {
      mountedRoutes: { '/custom-example': examplePage.getOutput('coreExtensionData.routeRef') },
    });

    expect(await screen.findByText('Example Page')).toBeInTheDocument();
  });
});
```

---

## Testing Utility APIs

### Testing an API Implementation Directly

Test custom API implementations without rendering anything:

```tsx
import { DefaultExampleApi } from './ExampleApi';

describe('DefaultExampleApi', () => {
  let api: DefaultExampleApi;
  let mockDiscoveryApi: { getBaseUrl: jest.Mock };
  let mockFetchApi: { fetch: jest.Mock };

  beforeEach(() => {
    mockDiscoveryApi = {
      getBaseUrl: jest.fn().mockResolvedValue('https://api.example.com'),
    };
    mockFetchApi = { fetch: jest.fn() };
    api = new DefaultExampleApi({
      discoveryApi: mockDiscoveryApi as any,
      fetchApi: mockFetchApi as any,
    });
  });

  it('fetches data correctly', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: '123', name: 'Test' }),
    });

    const result = await api.fetchData('123');

    expect(result).toEqual({ id: '123', name: 'Test' });
    expect(mockDiscoveryApi.getBaseUrl).toHaveBeenCalledWith('example');
  });

  it('throws a helpful error on 404', async () => {
    mockFetchApi.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(api.fetchData('invalid')).rejects.toThrow(/not found/i);
  });
});
```

### Testing Components Through Mocked APIs

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { exampleApiRef } from './api';
import { DataDisplay } from './DataDisplay';

describe('DataDisplay', () => {
  it('displays data from API', async () => {
    const mockApi = {
      fetchData: jest.fn().mockResolvedValue({ id: '123', name: 'Test Data' }),
    };

    await renderInTestApp(<DataDisplay id="123" />, {
      apis: [[exampleApiRef, mockApi]],
    });

    expect(await screen.findByText('Test Data')).toBeInTheDocument();
    expect(mockApi.fetchData).toHaveBeenCalledWith('123');
  });
});
```

---

## Testing Entity Components

For components that depend on `useEntity`, wrap with `EntityProvider`. For more realistic setups, use `createTestEntityPage` from `@backstage/plugin-catalog-react/testUtils` which assembles a plausible entity route shell:

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { screen } from '@testing-library/react';
import { EntityComponent } from './EntityComponent';

describe('EntityComponent', () => {
  it('renders entity information', async () => {
    const entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'my-component', namespace: 'default' },
      spec: { type: 'service', lifecycle: 'production' },
    };

    await renderInTestApp(
      <EntityProvider entity={entity}>
        <EntityComponent />
      </EntityProvider>,
    );

    expect(await screen.findByText('my-component')).toBeInTheDocument();
    expect(screen.getByText('service')).toBeInTheDocument();
  });
});
```

---

## Testing Permissions

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { permissionApiRef } from '@backstage/plugin-permission-react';
import { screen } from '@testing-library/react';
import { ProtectedComponent } from './ProtectedComponent';

describe('ProtectedComponent', () => {
  it('shows content when allowed', async () => {
    const permissionApi = {
      authorize: jest.fn().mockResolvedValue({ result: 'ALLOW' }),
    };

    await renderInTestApp(<ProtectedComponent />, {
      apis: [[permissionApiRef, permissionApi]],
    });

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('hides content when denied', async () => {
    const permissionApi = {
      authorize: jest.fn().mockResolvedValue({ result: 'DENY' }),
    };

    await renderInTestApp(<ProtectedComponent />, {
      apis: [[permissionApiRef, permissionApi]],
    });

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
```

---

## Testing Routes and Navigation

Use the `mountedRoutes` option to satisfy `useRouteRef` during tests:

```tsx
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { rootRouteRef } from './routes';
import { screen } from '@testing-library/react';

function NavigationComponent() {
  const getPath = useRouteRef(rootRouteRef);
  return <a href={getPath()}>Go to Example</a>;
}

describe('NavigationComponent', () => {
  it('links to the mounted route', async () => {
    await renderInTestApp(<NavigationComponent />, {
      mountedRoutes: { '/example': rootRouteRef },
    });

    expect(screen.getByText('Go to Example')).toHaveAttribute('href', '/example');
  });
});
```

---

## Best Practices

### Test Organization

```tsx
describe('ComponentName', () => {
  describe('rendering', () => {
    it('renders basic content', () => { /* ... */ });
    it('handles loading state', () => { /* ... */ });
    it('handles error state', () => { /* ... */ });
  });

  describe('interactions', () => {
    it('handles button click', () => { /* ... */ });
    it('submits form data', () => { /* ... */ });
  });

  describe('edge cases', () => {
    it('handles empty data', () => { /* ... */ });
    it('handles network errors', () => { /* ... */ });
  });
});
```

Prefer fewer thorough tests with multiple assertions over many small ones — it's faster and easier to maintain while still catching regressions.

### Async Testing

Always await async rendering and use `findBy*` (which retries with a built-in timeout) for asynchronous assertions:

```tsx
// Good
await renderInTestApp(<Component />);
expect(await screen.findByText('Loaded')).toBeInTheDocument();

// Avoid — may race with loading state
renderInTestApp(<Component />);
expect(screen.getByText('Loaded')).toBeInTheDocument();
```

### Mock Cleanup

```tsx
describe('Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Tests...
});
```

### Avoid `test-id` attributes

Query by user-visible text, role, or label. Only fall back to `data-testid` when the DOM doesn't expose a sensible way to find the element — that keeps tests robust to cosmetic markup changes.

---

## Running Tests

### Command Line

```bash
# Run all tests in the current package (--watchAll=false prevents jest watch
# mode, which never exits in CI/agents)
yarn backstage-cli package test --watchAll=false

# Watch mode
yarn backstage-cli package test --watch

# With coverage
yarn backstage-cli package test --coverage --watchAll=false

# A specific file
yarn backstage-cli package test ExampleComponent.test.tsx --watchAll=false
```

From the repo root, the top-level invocation is:

```bash
CI=1 yarn test <path>
```

Always pass a path — running the entire suite is slow and rarely what you want.

---

## Common Testing Patterns

### Error Handling

```tsx
it('displays an error message when the API fails', async () => {
  const mockApi = {
    fetchData: jest.fn().mockRejectedValue(new Error('Network error')),
  };

  await renderInTestApp(<DataComponent id="123" />, {
    apis: [[exampleApiRef, mockApi]],
  });

  expect(await screen.findByText(/error/i)).toBeInTheDocument();
});
```

### Snapshot Testing

Use sparingly — snapshots are brittle in UI code. Only snapshot stable, deterministic output:

```tsx
it('matches snapshot for the default render', async () => {
  const { container } = await renderInTestApp(<Component data={mockData} />);
  expect(container.firstChild).toMatchSnapshot();
});
```

---

## Official Documentation

For the latest testing guidance:
- [Frontend System Testing](https://backstage.io/docs/frontend-system/building-plugins/testing/)
- [Testing Utility APIs](https://backstage.io/docs/frontend-system/utility-apis/testing/)
- [Testing with Jest (shared)](https://backstage.io/docs/plugins/testing/)
