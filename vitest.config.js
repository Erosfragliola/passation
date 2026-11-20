import { defineConfig } from "vitest/config";
// test/langues.setup.js : dictionnaires installés pour les modules partagés (t() de public/js/i18n.js).
export default defineConfig({ test: { include: ["test/**/*.test.js"], setupFiles: ["test/langues.setup.js"] } });
