/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API; empty string = same origin (dev proxy / Worker assets). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
