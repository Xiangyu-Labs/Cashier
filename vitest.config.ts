import { defineConfig } from "vitest/config";
import {
  coverageConfig,
  integrationProjects,
  resolveAliases,
  smokeProjects,
  unitProjects,
} from "./vitest.shared.config";

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [...unitProjects, ...integrationProjects, ...smokeProjects],
  },
});
