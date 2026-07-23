/**
 * Loading a document from a signed URL passed in the `?loadFile=` query parameter.
 *
 * The Demokratis backend opens StructEdit at `…/?loadFile=<url-encoded signed URL>`.
 * This module holds the pure, React-free core of that flow: parsing + host-allowlist
 * validation of the parameter, and fetching the document with the HTTP-status → reason
 * mapping the UI needs. See `openspec/changes/add-loadfile-url-import/design.md`.
 */

/** Host always used for production signed files; the built-in default allowlist. */
const DEFAULT_ALLOWED_HOSTS = ['demokratis.ch'];

/** The subset of `import.meta.env` this module reads, so callers/tests can inject it. */
interface AllowlistEnv {
  DEV?: boolean;
  VITE_LOADFILE_ALLOWED_HOSTS?: string;
}

/**
 * Resolve the effective host allowlist. Defaults to `demokratis.ch`; a comma-separated
 * `VITE_LOADFILE_ALLOWED_HOSTS` overrides the default; `localhost`/`127.0.0.1` are added
 * in development so the flow can be exercised locally. App and tests share this one source.
 */
export function resolveAllowedHosts(env: AllowlistEnv = import.meta.env): string[] {
  const configured = (env.VITE_LOADFILE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const hosts = configured.length > 0 ? configured : [...DEFAULT_ALLOWED_HOSTS];
  if (env.DEV) {
    hosts.push('localhost', '127.0.0.1');
  }
  return hosts;
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * A host is allowed when it equals an allowlist entry or is a subdomain of one on a
 * dot boundary. Never a bare `includes()` — that lets `demokratis.ch.evil.com` and
 * `notdemokratis.ch` through.
 */
function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  const h = host.toLowerCase();
  return allowedHosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

export type ParseLoadFileResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'absent' | 'malformed' | 'forbidden-host' };

/**
 * Read and validate the `loadFile` parameter from a query string. Performs no I/O.
 * Returns the decoded URL only when it parses, targets an allowlisted host, and uses
 * an allowed scheme (`https`, or `http` for an allowlisted localhost in dev).
 */
export function parseLoadFileParam(search: string, allowedHosts: string[]): ParseLoadFileResult {
  const raw = new URLSearchParams(search).get('loadFile');
  if (!raw) return { ok: false, reason: 'absent' };

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  let url: URL;
  try {
    url = new URL(decoded);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!isHostAllowed(url.hostname, allowedHosts)) {
    return { ok: false, reason: 'forbidden-host' };
  }

  const schemeOk =
    url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname));
  if (!schemeOk) {
    return { ok: false, reason: 'forbidden-host' };
  }

  return { ok: true, url: url.toString() };
}

/** Failure reasons that can arise from the network fetch itself. */
export type RemoteFetchErrorReason = 'expired' | 'not-found' | 'network' | 'unsupported-content';

/**
 * What a successful fetch carried, so the caller picks the matching pipeline:
 * HTML goes through the legal-HTML parser, JSON is validated as a DocTree envelope.
 * This layer stays transport-only — it classifies the content type and reads the
 * body, but never parses JSON or touches the document model.
 */
export type RemoteDocumentContent = { kind: 'html'; html: string } | { kind: 'json'; raw: string };

export type RemoteFetchResult =
  | { ok: true; content: RemoteDocumentContent; sourceUrl: string }
  | { ok: false; reason: RemoteFetchErrorReason };

function looksLikeHtml(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes('text/html') || ct.includes('application/xhtml');
}

function looksLikeJson(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  // `+json` covers structured-syntax suffixes like application/ld+json.
  return ct.includes('application/json') || ct.includes('+json');
}

/**
 * Fetch a (pre-validated) document URL and map the outcome to a discriminated result.
 * `fetchImpl` is injectable so tests exercise every status branch without a network.
 *
 * Mapping: 410 → expired, 404 → not-found, any other non-OK status or thrown error
 * (CORS/offline surface as `TypeError`) → network, a 2xx body that is neither HTML
 * nor JSON, or is empty → unsupported-content.
 */
export async function fetchRemoteDocument(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<RemoteFetchResult> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!response.ok) {
    if (response.status === 410) return { ok: false, reason: 'expired' };
    if (response.status === 404) return { ok: false, reason: 'not-found' };
    return { ok: false, reason: 'network' };
  }

  const contentType = response.headers.get('content-type');
  const kind = looksLikeHtml(contentType) ? 'html' : looksLikeJson(contentType) ? 'json' : null;
  if (!kind) {
    return { ok: false, reason: 'unsupported-content' };
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!body.trim()) {
    return { ok: false, reason: 'unsupported-content' };
  }

  const content: RemoteDocumentContent =
    kind === 'html' ? { kind, html: body } : { kind, raw: body };
  return { ok: true, content, sourceUrl: url };
}

/** Every reason a `loadFile` load can fail, across parsing and fetching. */
export type RemoteLoadErrorReason = RemoteFetchErrorReason | 'forbidden-host' | 'malformed';

/**
 * User-facing copy per failure reason — single source of truth shared by the UI and
 * tests. `forbidden-host`/`malformed` only arise from a hand-edited URL, so they reuse
 * the "invalid link" copy.
 */
export const REMOTE_LOAD_MESSAGES: Record<RemoteLoadErrorReason, string> = {
  expired: 'Link expired, re-open from demokratis.ch.',
  'not-found': 'This document link is invalid. Re-open it from demokratis.ch.',
  network:
    "Couldn't load the document. Check your connection and try re-opening it from demokratis.ch.",
  'unsupported-content': "Couldn't read the document — it wasn't in a supported format.",
  'forbidden-host': 'This document link is invalid. Re-open it from demokratis.ch.',
  malformed: 'This document link is invalid. Re-open it from demokratis.ch.',
};
