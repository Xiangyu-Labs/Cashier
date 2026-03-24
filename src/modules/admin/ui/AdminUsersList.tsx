import { UserRole, type UserRoleValue } from "@/modules/admin/types";

export interface AdminUserListItem {
  id: string;
  email: string;
  name: string | null;
  role: UserRoleValue;
  createdAt: Date;
}

export interface AdminUsersListLabels {
  title: string;
  description: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  emptyTitle: string;
  emptyDescription: string;
  roleUser: string;
  roleSuperAdmin: string;
}

function formatRole(role: UserRoleValue, labels: AdminUsersListLabels): string {
  return role === UserRole.SuperAdmin ? labels.roleSuperAdmin : labels.roleUser;
}

export function AdminUsersList(props: {
  locale: string;
  users: AdminUserListItem[];
  labels: AdminUsersListLabels;
}) {
  if (props.users.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="space-y-2 text-center">
          <h2 className="text-lg font-semibold text-text">{props.labels.emptyTitle}</h2>
          <p className="text-sm text-muted">{props.labels.emptyDescription}</p>
        </div>
      </section>
    );
  }

  const dateFormatter = new Intl.DateTimeFormat(props.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-text">{props.labels.title}</h2>
        <p className="mt-1 text-sm text-muted">{props.labels.description}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface2/70 text-left">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.email}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.name}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.role}
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted">
                {props.labels.createdAt}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.users.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-b-0">
                <td className="px-6 py-4 text-sm font-medium text-text">{user.email}</td>
                <td className="px-6 py-4 text-sm text-text">{user.name ?? ""}</td>
                <td className="px-6 py-4 text-sm text-text">
                  <span className="inline-flex rounded-full border border-border bg-surface2 px-3 py-1 text-xs font-medium text-text">
                    {formatRole(user.role, props.labels)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted">
                  {dateFormatter.format(user.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
