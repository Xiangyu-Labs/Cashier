/**
 * Map of feature names to locale namespace keys for deferred loading.
 * Each inactive tab imports its own messages subset when the feature
 * component is first mounted.
 *
 * Shell namespaces are loaded in the global locale layout.
 * Active tab namespaces are loaded in the active-tab component.
 * Inactive tabs load their messages lazily.
 */
import featureMessages from "./client-feature-message-map.json";

export const FEATURE_MESSAGES = featureMessages;

/**
 * Pick only the specified namespaces from a messages object.
 */
export function pickMessages<TMessages extends Record<string, unknown>>(
  messages: TMessages,
  namespaces: readonly string[]
): Partial<TMessages> {
  const picked: Partial<TMessages> = {};
  for (const ns of namespaces) {
    if (ns in messages) {
      picked[ns as keyof TMessages] = messages[ns as keyof TMessages];
    }
  }
  return picked;
}
