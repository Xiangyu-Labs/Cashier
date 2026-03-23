import { auth } from "@/auth";

export async function getCurrentUser(): Promise<{
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
} | null> {
  const session = await auth();
  const user = session?.user;

  if (user?.id == null || user.id === "") {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  };
}
