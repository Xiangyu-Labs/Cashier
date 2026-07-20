import { defineConfig } from "vitest/config";
import {
  coverageConfig,
  integrationProjects,
  performanceProjects,
  resolveAliases,
  unitProjects,
} from "./vitest.shared.config";

export default defineConfig({
  resolve: {
    alias: resolveAliases,
  },
  test: {
    coverage: coverageConfig,
    projects: [...unitProjects, ...integrationProjects, ...performanceProjects],
  },
});
