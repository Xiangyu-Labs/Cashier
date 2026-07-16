import type { UserAccountPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { UnauthorizedError } from "@/lib/errors";

export async function getSessionUser(
  userId: string,
  users: UserAccountPort = currentApplication.userAccounts
) {
  const user = await users.findById(userId);
  if (user == null) throw new UnauthorizedError("User not found in database");
  return user;
}
