import {
  CircleSlash,
  Home,
  Package,
  Utensils,
  Coffee,
  Wine,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Gamepad2,
  Music,
  Ticket,
  Film,
  Bus,
  Car,
  TrainFront,
  Plane,
  Bike,
  Stethoscope,
  Heart,
  House,
  Building,
  Key,
  Book,
  GraduationCap,
  Laptop,
  Phone,
  Camera,
  Headphones,
  Wifi,
  Wallet,
  CreditCard,
  Banknote,
  Receipt,
  PiggyBank,
  Briefcase,
  Hammer,
  Dumbbell,
  Baby,
  Dog,
  Gift,
  Glasses,
  Umbrella,
  Watch,
  Hotel,
  MapPin,
  Luggage,
  Crown,
  Star,
  Lightbulb,
  Palette,
  Scissors,
  Tag,
  Truck,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React from "react";
import { CATEGORY_ICON_MAP } from "@/config/icons";

const iconRecord: Record<string, LucideIcon> = {
  Utensils,
  Coffee,
  Wine,
  ShoppingBag,
  ShoppingCart,
  Shirt,
  Gamepad2,
  Music,
  Ticket,
  Film,
  Bus,
  Car,
  TrainFront,
  Plane,
  Bike,
  Stethoscope,
  Heart,
  House,
  Building,
  Key,
  Book,
  GraduationCap,
  Laptop,
  Phone,
  Camera,
  Headphones,
  Wifi,
  Wallet,
  CreditCard,
  Banknote,
  Receipt,
  PiggyBank,
  Briefcase,
  Hammer,
  Dumbbell,
  Baby,
  Dog,
  Gift,
  Glasses,
  Umbrella,
  Watch,
  Hotel,
  MapPin,
  Luggage,
  Crown,
  Star,
  Lightbulb,
  Palette,
  Scissors,
  Tag,
  Truck,
  Zap,
  Package,
  Home,
  CircleSlash,
};

interface CategoryIconProps {
  iconName?: string | null;
  className?: string;
}

export function CategoryIcon({ iconName, className }: CategoryIconProps) {
  if (iconName == null || iconName === "") {
    return <Package className={className} />;
  }

  const safeIconName = CATEGORY_ICON_MAP[iconName];
  const IconComponent = safeIconName == null ? undefined : iconRecord[safeIconName];

  if (IconComponent) {
    return <IconComponent className={className} />;
  }

  return <Package className={className} />;
}
