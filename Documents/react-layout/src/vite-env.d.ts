/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ANGULAR_APP_URL?: string;
  readonly VITE_ANGULAR_LOGIN_PATH?: string;
  readonly VITE_ANGULAR_PLANNER_PATH?: string;
  readonly VITE_AUTH_STORAGE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
