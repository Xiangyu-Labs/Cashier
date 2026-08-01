import { defineConfig } from "vitest/config";
import {
  coverageConfig,
  integrationProjects,
  resolveAliases,
  unitProjects,
} from "./vitest.shared.config.mjs";

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [...unitProjects, ...integrationProjects],
  },
});
