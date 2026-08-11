/**
 * Common Lucide React icon names used throughout the application
 * for category icons and other UI elements.
 */
export const COMMON_LUCIDE_ICONS = [
  // 餐饮
  "Utensils",
  "Coffee",
  "Wine",
  // 购物
  "ShoppingBag",
  "ShoppingCart",
  "Shirt",
  // 娱乐
  "Gamepad2",
  "Music",
  "Ticket",
  "Film",
  // 交通
  "Bus",
  "Car",
  "TrainFront",
  "Plane",
  "Bike",
  // 医疗
  "Stethoscope",
  "Heart",
  // 居住
  "House",
  "Building",
  "Key",
  // 教育
  "Book",
  "GraduationCap",
  // 数码
  "Laptop",
  "Phone",
  "Camera",
  "Headphones",
  "Wifi",
  // 财务
  "Wallet",
  "CreditCard",
  "Banknote",
  "Receipt",
  "PiggyBank",
  // 工作
  "Briefcase",
  "Hammer",
  // 运动健身
  "Dumbbell",
  // 生活
  "Baby",
  "Dog",
  "Gift",
  "Glasses",
  "Umbrella",
  "Watch",
  // 旅行
  "Hotel",
  "MapPin",
  "Luggage",
  // 通用
  "Crown",
  "Star",
  "Lightbulb",
  "Palette",
  "Scissors",
  "Tag",
  "Truck",
  "Zap",
  "Package",
] as const;

export type CommonLucideIcon = (typeof COMMON_LUCIDE_ICONS)[number];
