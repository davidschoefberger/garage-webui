export {};

declare global {
  // Injected at build time by Vite (see vite.config.ts) from package.json.
  const __APP_VERSION__: string;

  interface Window {
    __BASE_PATH?: string;
  }
}
