import { icons } from "lucide-react";
import { type LucideIcon } from "lucide-react";
import React from "react";

interface CategoryIconProps {
  iconName?: string | null;
  className?: string;
}

export function CategoryIcon({ iconName, className }: CategoryIconProps) {
  if (!iconName) {
    const PackageIcon = icons.Package;
    return <PackageIcon className={className} />;
  }

  // Check if it's a specific emoji we want to fallback (optional)
  // or checks if it is a valid Lucide icon name
  const IconComponent = icons[iconName as keyof typeof icons] as LucideIcon | undefined;

  if (IconComponent) {
    return <IconComponent className={className} />;
  }

  // Fallback to rendering as text (likely emoji)
  return <span className={className}>{iconName}</span>;
}
