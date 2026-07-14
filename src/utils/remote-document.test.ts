import { describe, expect, it, vi } from 'vitest';
import {
  fetchRemoteDocument,
  parseLoadFileParam,
  REMOTE_LOAD_MESSAGES,
  type RemoteLoadErrorReason,
  resolveAllowedHosts,
} from './remote-document';

const ALLOWED = ['demokratis.ch'];

/** Build a `?loadFile=...` search string with the URL properly encoded. */
function searchFor(url: string): string {
  return `?loadFile=${encodeURIComponent(url)}`;
}

/** Minimal Response stub good enough for fetchRemoteDocument. */
function makeResponse(
  body: string,
  init: { status?: number; contentType?: string | null } = {}
): Response {
  const { status = 200, contentType = 'text/html; charset=utf-8' } = init;
  const headers = new Headers();
  if (contentType !== null) headers.set('content-type', contentType);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('parseLoadFileParam', () => {
  it('returns the decoded URL for an allowlisted host', () => {
    const url = 'https://demokratis.ch/file/abc-123?_expiration=999&_hash=deadbeef';
    const result = parseLoadFileParam(searchFor(url), ALLOWED);
    expect(result).toEqual({ ok: true, url });
  });

  it('accepts a subdomain of an allowlisted host', () => {
    const url = 'https://files.demokratis.ch/file/abc-123';
    const result = parseLoadFileParam(searchFor(url), ALLOWED);
    expect(result.ok).toBe(true);
  });

  it('returns absent when no loadFile param is present', () => {
    expect(parseLoadFileParam('?foo=bar', ALLOWED)).toEqual({ ok: false, reason: 'absent' });
    expect(parseLoadFileParam('', ALLOWED)).toEqual({ ok: false, reason: 'absent' });
  });

  it('rejects a non-allowlisted host without fetching', () => {
    const url = 'https://evil.example.com/file/abc-123';
    expect(parseLoadFileParam(searchFor(url), ALLOWED)).toEqual({
      ok: false,
      reason: 'forbidden-host',
    });
  });

  it('rejects a look-alike host that merely contains the allowed host', () => {
    for (const url of [
      'https://demokratis.ch.evil.com/file/x',
      'https://notdemokratis.ch/file/x',
    ]) {
      expect(parseLoadFileParam(searchFor(url), ALLOWED)).toEqual({
        ok: false,
        reason: 'forbidden-host',
      });
    }
  });

  it('rejects a non-https scheme on an allowlisted host', () => {
    const url = 'http://demokratis.ch/file/abc-123';
    expect(parseLoadFileParam(searchFor(url), ALLOWED).ok).toBe(false);
  });

  it('accepts http://localhost only when localhost is in the allowlist', () => {
    const url = 'http://localhost:5173/file/abc-123';
    expect(parseLoadFileParam(searchFor(url), [...ALLOWED, 'localhost']).ok).toBe(true);
    // Without localhost in the allowlist (prod), the same URL is rejected.
    expect(parseLoadFileParam(searchFor(url), ALLOWED).ok).toBe(false);
  });

  it('returns malformed for an unparseable value', () => {
    expect(parseLoadFileParam('?loadFile=not%20a%20url', ALLOWED)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('resolveAllowedHosts', () => {
  it('defaults to demokratis.ch when nothing is configured', () => {
    expect(resolveAllowedHosts({})).toEqual(['demokratis.ch']);
  });

  it('reads a comma-separated VITE_LOADFILE_ALLOWED_HOSTS list', () => {
    const hosts = resolveAllowedHosts({
      VITE_LOADFILE_ALLOWED_HOSTS: 'demokratis.ch, staging.demokratis.ch',
    });
    expect(hosts).toContain('demokratis.ch');
    expect(hosts).toContain('staging.demokratis.ch');
  });

  it('adds localhost in development', () => {
    const hosts = resolveAllowedHosts({ DEV: true });
    expect(hosts).toContain('localhost');
    expect(hosts).toContain('127.0.0.1');
  });

  it('does not add localhost in production', () => {
    const hosts = resolveAllowedHosts({ DEV: false });
    expect(hosts).not.toContain('localhost');
  });
});

describe('fetchRemoteDocument', () => {
  const URL_OK = 'https://demokratis.ch/file/abc-123';

  it('returns html content for a 200 HTML response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse('<h1>Hi</h1>'));
    const result = await fetchRemoteDocument(URL_OK, fetchImpl);
    expect(result).toEqual({
      ok: true,
      content: { kind: 'html', html: '<h1>Hi</h1>' },
      sourceUrl: URL_OK,
    });
    expect(fetchImpl).toHaveBeenCalledWith(URL_OK);
  });

  it('returns raw json content for a 200 JSON response', async () => {
    const body = '{"DocTreeVersion":1}';
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse(body, { contentType: 'application/json; charset=utf-8' }));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({
      ok: true,
      content: { kind: 'json', raw: body },
      sourceUrl: URL_OK,
    });
  });

  it('treats a +json structured-syntax content-type as json', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse('{}', { contentType: 'application/ld+json' }));
    const result = await fetchRemoteDocument(URL_OK, fetchImpl);
    expect(result).toEqual({ ok: true, content: { kind: 'json', raw: '{}' }, sourceUrl: URL_OK });
  });

  it('maps 410 to expired', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse('', { status: 410 }));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({ ok: false, reason: 'expired' });
  });

  it('maps 404 to not-found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse('', { status: 404 }));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('maps other non-OK statuses to network', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse('', { status: 500 }));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({ ok: false, reason: 'network' });
  });

  it('maps a thrown TypeError (CORS/offline) to network', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({ ok: false, reason: 'network' });
  });

  it('maps a content-type that is neither HTML nor JSON to unsupported-content', async () => {
    for (const contentType of ['text/plain', 'application/pdf', null]) {
      const fetchImpl = vi.fn().mockResolvedValue(makeResponse('some body', { contentType }));
      expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({
        ok: false,
        reason: 'unsupported-content',
      });
    }
  });

  it('maps an empty HTML body to unsupported-content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse('   '));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({
      ok: false,
      reason: 'unsupported-content',
    });
  });

  it('maps an empty JSON body to unsupported-content', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(makeResponse('   ', { contentType: 'application/json' }));
    expect(await fetchRemoteDocument(URL_OK, fetchImpl)).toEqual({
      ok: false,
      reason: 'unsupported-content',
    });
  });
});

describe('REMOTE_LOAD_MESSAGES', () => {
  it('uses the verbatim issue copy for expired links', () => {
    expect(REMOTE_LOAD_MESSAGES.expired).toBe('Link expired, re-open from demokratis.ch.');
  });

  it('has a distinct message for not-found vs expired', () => {
    expect(REMOTE_LOAD_MESSAGES['not-found']).not.toBe(REMOTE_LOAD_MESSAGES.expired);
  });

  it('covers every error reason', () => {
    const reasons: RemoteLoadErrorReason[] = [
      'expired',
      'not-found',
      'network',
      'unsupported-content',
      'forbidden-host',
      'malformed',
    ];
    for (const reason of reasons) {
      expect(typeof REMOTE_LOAD_MESSAGES[reason]).toBe('string');
      expect(REMOTE_LOAD_MESSAGES[reason].length).toBeGreaterThan(0);
    }
  });
});
