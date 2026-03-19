export * from "./types";
export { createFlowEngine } from "./engine";
export { createAIContext } from "./ai-context";
export { TaskCancelledError, throwIfCancelled } from "./cancellation";
export { loadFlowRuntimeEnvConfig } from "./config";
export {
  createFlowRuntime,
  initializeFlowRuntime,
  initializeDefaultFlowRuntime,
  getFlowRuntime,
  getFlowEngine,
  submitFlowTask,
  cancelFlowTask,
  resetFlowRuntime,
} from "./runtime";

import type { FlowEngine } from "./types";
import { getFlowEngine } from "./runtime";

// Backward-compatible proxy for existing tests and migration callers.
export const flowEngine: FlowEngine = {
  register: (...args) => getFlowEngine().register(...args),
  submit: (...args) => getFlowEngine().submit(...args),
  cancel: (...args) => getFlowEngine().cancel(...args),
  getStatus: (...args) => getFlowEngine().getStatus(...args),
  listTasks: (...args) => getFlowEngine().listTasks(...args),
  getRunningTasks: (...args) => getFlowEngine().getRunningTasks(...args),
  getMetrics: (...args) => getFlowEngine().getMetrics(...args),
};
