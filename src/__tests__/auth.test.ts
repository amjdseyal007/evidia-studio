import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { currentGroups, currentTenant, makeFakeJwt, parseJwtPayload, setToken } from '../lib/auth';

describe('auth (mock Cognito seam)', () => {
  it('parses custom:tenant_id and cognito:groups from a fake JWT', () => {
    const token = makeFakeJwt('acme_rare', ['tenant-acme_rare']);
    const payload = parseJwtPayload(token);
    expect(payload?.['custom:tenant_id']).toBe('acme_rare');
    expect(payload?.['cognito:groups']).toEqual(['tenant-acme_rare']);

    setToken(token);
    expect(currentTenant()).toBe('acme_rare');
    expect(currentGroups()).toEqual(['tenant-acme_rare']);
  });

  it('returns null for a malformed token', () => {
    expect(parseJwtPayload('not-a-jwt')).toBeNull();
  });
});
