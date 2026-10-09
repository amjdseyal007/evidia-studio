/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVIDIA_API_MODE?: string;
  readonly VITE_EVIDIA_API_BASE_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
