export function formatAdminTaskJsonValue(value: unknown, notAvailableLabel: string): string {
  if (value === undefined) {
    return notAvailableLabel;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value === "" ? '""' : value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    return JSON.stringify(value, null, 2);
  }

  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }

    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

export function AdminTaskJsonBlock(props: {
  label: string;
  value: unknown;
  notAvailableLabel: string;
}) {
  const renderedValue = formatAdminTaskJsonValue(props.value, props.notAvailableLabel);

  return (
    <div>
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd className="mt-1">
        <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-md border border-border bg-surface2 px-3 py-2">
          <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-text select-text">
            {renderedValue}
          </pre>
        </div>
      </dd>
    </div>
  );
}
