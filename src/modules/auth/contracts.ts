export interface AuthenticatedUserDto {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  defaultLedgerId?: string | null;
}
