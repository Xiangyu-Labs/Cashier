import { icons } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import React from "react";

interface CategoryIconProps {
  iconName?: string | null;
  className?: string;
}

export function CategoryIcon({ iconName, className }: CategoryIconProps) {
  const PackageIcon = icons.Package;

  if (iconName == null || iconName === "") {
    return <PackageIcon className={className} />;
  }

  // Category icons are constrained to Lucide keys so they stay vector-based and themeable.
  const IconComponent = icons[iconName as keyof typeof icons] as LucideIcon | undefined;

  if (IconComponent) {
    return <IconComponent className={className} />;
  }

  return <PackageIcon className={className} />;
}
