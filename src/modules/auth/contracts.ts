export interface AuthenticatedUserDto {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  interfaceLanguage: InterfaceLanguage;
}

export type InterfaceLanguage = "auto" | "zh" | "en";

export interface UserPreferences {
  interfaceLanguage: InterfaceLanguage;
}
