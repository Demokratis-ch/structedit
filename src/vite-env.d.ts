/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Comma-separated allowlist of hosts StructEdit may fetch a `loadFile` URL from. */
  readonly VITE_LOADFILE_ALLOWED_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
