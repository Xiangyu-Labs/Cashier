import { cache } from "react";
import type { UserAccountPort } from "@/application/contracts";
import { currentApplication } from "@/application/current";
import { UnauthorizedError } from "@/lib/errors";

const getSessionUserImpl = cache(
  async (userId: string, users?: UserAccountPort) => {
    const user = await (users ?? currentApplication.userAccounts).findById(userId);
    if (user == null) throw new UnauthorizedError("User not found in database");
    return user;
  }
);

export async function getSessionUser(
  userId: string,
  users: UserAccountPort = currentApplication.userAccounts
) {
  return getSessionUserImpl(userId, users);
}
