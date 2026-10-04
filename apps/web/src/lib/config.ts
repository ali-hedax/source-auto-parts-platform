/** Server-side configuration. Nothing here is exposed to the browser bundle. */
export function dataSource(): 'api' | 'fixtures' {
  const value = process.env.HEDAX_DATA_SOURCE ?? 'api';
  if (value === 'fixtures') {
    if (process.env.NODE_ENV === 'production') throw new Error('Fixture data is not allowed in production');
    return 'fixtures';
  }
  return 'api';
}

export function apiInternalUrl(): string {
  return (process.env.API_INTERNAL_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
}

export function publicSiteUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}
