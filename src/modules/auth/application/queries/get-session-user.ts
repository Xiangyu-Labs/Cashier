import { cache } from "react";
import type { UserAccountPort } from "@/application/contracts";
import { UnauthorizedError } from "@/lib/errors";

const getSessionUserImpl = cache(async (userId: string, users: UserAccountPort) => {
  const user = await users.findById(userId);
  if (user == null) throw new UnauthorizedError("User not found in database");
  return user;
});

export async function getSessionUser(userId: string, users: UserAccountPort) {
  return getSessionUserImpl(userId, users);
}
