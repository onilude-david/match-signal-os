/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional build-time API key baked into single-operator deploys. */
  readonly VITE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
