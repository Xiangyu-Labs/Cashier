import { CircleSlash, Home, Package, Utensils, Coffee, Wine, ShoppingBag, ShoppingCart, Shirt, Gamepad2, Music, Ticket, Film, Bus, Car, TrainFront, Plane, Bike, Stethoscope, Heart, House, Building, Key, Book, GraduationCap, Laptop, Phone, Camera, Headphones, Wifi, Wallet, CreditCard, Banknote, Receipt, PiggyBank, Briefcase, Hammer, Dumbbell, Baby, Dog, Gift, Glasses, Umbrella, Watch, Hotel, MapPin, Luggage, Crown, Star, Lightbulb, Palette, Scissors, Tag, Truck, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React from "react";

const iconRecord: Record<string, LucideIcon> = {
  Utensils, Coffee, Wine, ShoppingBag, ShoppingCart, Shirt,
  Gamepad2, Music, Ticket, Film, Bus, Car, TrainFront, Plane, Bike,
  Stethoscope, Heart, House, Building, Key, Book, GraduationCap,
  Laptop, Phone, Camera, Headphones, Wifi, Wallet, CreditCard,
  Banknote, Receipt, PiggyBank, Briefcase, Hammer, Dumbbell,
  Baby, Dog, Gift, Glasses, Umbrella, Watch, Hotel, MapPin, Luggage,
  Crown, Star, Lightbulb, Palette, Scissors, Tag, Truck, Zap, Package,
  Home, CircleSlash,
};

interface CategoryIconProps {
  iconName?: string | null;
  className?: string;
}

export function CategoryIcon({ iconName, className }: CategoryIconProps) {
  if (iconName == null || iconName === "") {
    return <Package className={className} />;
  }

  // Check if it's a specific emoji we want to fallback (optional)
  // or checks if it is a valid Lucide icon name
  const IconComponent = iconRecord[iconName];

  if (IconComponent) {
    return <IconComponent className={className} />;
  }

  // Fallback to rendering as text (likely emoji)
  return <span className={className}>{iconName}</span>;
}
