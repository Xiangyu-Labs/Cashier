export const UserRole = {
  User: "user",
  SuperAdmin: "super_admin",
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];
