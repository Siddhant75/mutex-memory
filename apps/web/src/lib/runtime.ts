import {
  createHttpDemoApiClient,
  type DemoApiClient,
  type FetchImplementation,
} from './api.js';
import { createFixtureDemoApiClient } from './fixture-api.js';

export interface DemoRuntimeEnvironment {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_FIXTURES?: string;
}

export interface DemoRuntime {
  client: DemoApiClient;
  fixtureMode: boolean;
}

export class RuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigurationError';
  }
}

export function resolveDemoRuntime(
  environment: DemoRuntimeEnvironment,
  fetchImpl: FetchImplementation = globalThis.fetch,
): DemoRuntime {
  if (environment.VITE_USE_FIXTURES === 'true') {
    return { client: createFixtureDemoApiClient(), fixtureMode: true };
  }

  const apiUrl = environment.VITE_API_URL?.trim();
  if (!apiUrl) {
    throw new RuntimeConfigurationError(
      'VITE_API_URL is required when fixture mode is disabled.',
    );
  }

  return {
    client: createHttpDemoApiClient({ baseUrl: apiUrl, fetchImpl }),
    fixtureMode: false,
  };
}
