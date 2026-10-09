import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createStudioApi,
  resolveApiModeConfig,
  StudioConfigError,
} from '../lib/api';

describe('API mode resolution (VITE_EVIDIA_API_MODE)', () => {
  it('defaults to mock with fixtures when VITE_EVIDIA_API_MODE is unset', () => {
    const config = resolveApiModeConfig({});
    expect(config.mode).toBe('mock');
    expect(config.apiBaseUrl).toBeNull();
    expect(createStudioApi(config).mode).toBe('mock');
  });

  it('treats an explicit empty VITE_EVIDIA_API_MODE as mock default', () => {
    expect(resolveApiModeConfig({ VITE_EVIDIA_API_MODE: '  ' }).mode).toBe('mock');
  });

  it('resolves the live client when mode=live and all required vars are present', async () => {
    const config = resolveApiModeConfig({
      VITE_EVIDIA_API_MODE: 'live',
      VITE_EVIDIA_API_BASE_URL: 'https://api.evidia.example.com/',
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_ExamplePool',
      VITE_COGNITO_CLIENT_ID: 'example-client-id',
    });
    expect(config.mode).toBe('live');
    expect(config.apiBaseUrl).toBe('https://api.evidia.example.com/');

    const liveApi = createStudioApi(config, {
      getAuthToken: () => 'test-id-token',
      getTenantId: () => 'acme_rare',
      fetchFn: (async (url: string) => {
        expect(String(url)).toBe('https://api.evidia.example.com/admin/tenants');
        return new Response(JSON.stringify({ tenants: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch,
    });
    expect(liveApi.mode).toBe('live');
    await expect(liveApi.listTenants()).resolves.toEqual([]);
  });

  it('live fetch joins the base URL and sends the Bearer token from the auth seam', async () => {
    const config = resolveApiModeConfig({
      VITE_EVIDIA_API_MODE: 'live',
      VITE_EVIDIA_API_BASE_URL: 'https://api.evidia.example.com/',
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_ExamplePool',
      VITE_COGNITO_CLIENT_ID: 'example-client-id',
    });
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.evidia.example.com/cohorts/validate');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-id-token');
      expect(headers['X-Tenant-Id']).toBe('acme_rare');
      return new Response(JSON.stringify({ valid: true, errors: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const liveApi = createStudioApi(config, {
      fetchFn,
      getAuthToken: () => 'test-id-token',
      getTenantId: () => 'acme_rare',
    });
    await expect(
      liveApi.validateCohort({ name: 'x' } as never),
    ).resolves.toEqual({ valid: true, errors: [] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('surfaces JSON errors as thrown ApiError', async () => {
    const config = resolveApiModeConfig({
      VITE_EVIDIA_API_MODE: 'live',
      VITE_EVIDIA_API_BASE_URL: 'https://api.evidia.example.com',
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_ExamplePool',
      VITE_COGNITO_CLIENT_ID: 'example-client-id',
    });
    const liveApi = createStudioApi(config, {
      getAuthToken: () => 'test-id-token',
      getTenantId: () => 'acme_rare',
      fetchFn: (async () =>
        new Response(JSON.stringify({ detail: 'tenant not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    });
    await expect(liveApi.getTenantAdmin('missing_tenant')).resolves.toBeNull();
    await expect(liveApi.listTenants()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws StudioConfigError naming every missing var when live mode is incomplete', () => {
    let caught: unknown;
    try {
      resolveApiModeConfig({ VITE_EVIDIA_API_MODE: 'live' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StudioConfigError);
    const err = caught as StudioConfigError;
    expect(err.missing).toEqual([
      'VITE_EVIDIA_API_BASE_URL',
      'VITE_COGNITO_USER_POOL_ID',
      'VITE_COGNITO_CLIENT_ID',
    ]);
    expect(err.message).toContain('VITE_EVIDIA_API_BASE_URL');
    expect(err.message).toContain('VITE_COGNITO_USER_POOL_ID');
    expect(err.message).toContain('VITE_COGNITO_CLIENT_ID');
  });

  it('names only the missing vars when live mode is partially configured', () => {
    expect(() =>
      resolveApiModeConfig({
        VITE_EVIDIA_API_MODE: 'live',
        VITE_EVIDIA_API_BASE_URL: 'https://api.evidia.example.com',
        VITE_COGNITO_USER_POOL_ID: '',
        VITE_COGNITO_CLIENT_ID: 'example-client-id',
      }),
    ).toThrow(/VITE_COGNITO_USER_POOL_ID/);
  });
});
