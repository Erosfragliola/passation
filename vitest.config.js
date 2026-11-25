import { defineConfig } from "vitest/config";
// test/langues.setup.js: dictionaries installed for the shared modules (t() from public/js/i18n.js).
export default defineConfig({ test: { include: ["test/**/*.test.js"], setupFiles: ["test/langues.setup.js"] } });
