const zhLedger = {
  settings: {
    aiLanguage: "zh-CN",
    currencies: ["CNY", "USD"] as string[],
    mainCurrency: "CNY",
    collapseEntriesDefault: false,
    aiCustomPrompt: "",
    timeZone: null,
  },
  categories: [
    {
      name: "餐饮",
      description: "涵盖日常膳食及饮水支出，包括正餐、烹饪食材、调味品、饮品及零食",
      icon: "Utensils",
      sortOrder: 1,
    },
    {
      name: "日用",
      description: "涵盖日常居家消耗品支出，如纸品、清洁用品、厨房耗材及其他日用百货",
      icon: "ShoppingCart",
      sortOrder: 2,
    },
    {
      name: "娱乐",
      description: "涵盖休闲、社交与文化活动支出，如游戏、电影、演出、展览及相关数字服务",
      icon: "Gamepad2",
      sortOrder: 3,
    },
    {
      name: "交通",
      description: "涵盖通勤及出行费用，如公共交通、网约车、燃油及停车费",
      icon: "Bus",
      sortOrder: 4,
    },
    {
      name: "医疗",
      description: "涵盖医疗与健康支出，如药品、诊疗、体检及营养保健品",
      icon: "Stethoscope",
      sortOrder: 5,
    },
    {
      name: "教育",
      description: "涵盖学习与技能提升支出，如学费、课程培训、书籍教材、考试报名及学习工具",
      icon: "GraduationCap",
      sortOrder: 6,
    },
    {
      name: "会员",
      description: "涵盖各类会员及订阅支出，如应用订阅、API 配额及健身场馆会费",
      icon: "Crown",
      sortOrder: 7,
    },
    {
      name: "服饰",
      description: "涵盖衣物、鞋靴、箱包、首饰、手表及其他穿戴配饰的购置、清洗与修补",
      icon: "Shirt",
      sortOrder: 8,
    },
    {
      name: "个护",
      description: "涵盖个人护理及形象管理支出，如洗护、护肤、彩妆、香水、理发及美容服务",
      icon: "Scissors",
      sortOrder: 9,
    },
    {
      name: "购物",
      description:
        "用于无法归入日用、服饰、个护或其他明确类别的商品，如数码电子、文具、礼品及杂项商品",
      icon: "ShoppingBag",
      sortOrder: 10,
    },
    {
      name: "人情",
      description: "涵盖红包、礼金、请客、捐赠及其他人情往来支出",
      icon: "Gift",
      sortOrder: 11,
    },
    {
      name: "住房",
      description: "涵盖住房相关固定支出，如房租、水电燃气、网络、物业管理及家居修缮",
      icon: "House",
      sortOrder: 12,
    },
  ],
};

const enLedger = {
  settings: {
    aiLanguage: "en",
    currencies: ["USD", "EUR", "GBP"] as string[],
    mainCurrency: "USD",
    collapseEntriesDefault: false,
    aiCustomPrompt: "",
    timeZone: null,
  },
  categories: [
    {
      name: "Dining",
      description:
        "Daily food and drink expenses, including meals, cooking ingredients, seasonings, beverages, and snacks",
      icon: "Utensils",
      sortOrder: 1,
    },
    {
      name: "Household",
      description:
        "Everyday household consumables, such as paper products, cleaning supplies, kitchen supplies, and other household goods",
      icon: "ShoppingCart",
      sortOrder: 2,
    },
    {
      name: "Entertainment",
      description:
        "Leisure, social, and cultural activities, such as games, movies, performances, exhibitions, and related digital services",
      icon: "Gamepad2",
      sortOrder: 3,
    },
    {
      name: "Transport",
      description:
        "Commuting and travel expenses, such as public transit, rideshare, fuel, and parking fees",
      icon: "Bus",
      sortOrder: 4,
    },
    {
      name: "Healthcare",
      description:
        "Medical and health expenses, such as medication, treatment, checkups, and nutritional supplements",
      icon: "Stethoscope",
      sortOrder: 5,
    },
    {
      name: "Education",
      description:
        "Learning and skill-development expenses, such as tuition, courses, books, exam fees, and study tools",
      icon: "GraduationCap",
      sortOrder: 6,
    },
    {
      name: "Memberships",
      description:
        "Membership and subscription expenses, such as app subscriptions, API quotas, and gym memberships",
      icon: "Crown",
      sortOrder: 7,
    },
    {
      name: "Clothing",
      description:
        "Clothing, footwear, bags, jewelry, watches, and other wearable accessories, including purchases, cleaning, and repairs",
      icon: "Shirt",
      sortOrder: 8,
    },
    {
      name: "Personal Care",
      description:
        "Personal care and grooming expenses, such as hair care, skincare, cosmetics, perfume, haircuts, and beauty services",
      icon: "Scissors",
      sortOrder: 9,
    },
    {
      name: "Shopping",
      description:
        "Goods that do not fit household, clothing, personal care, or another specific category, such as electronics, stationery, gifts, and miscellaneous items",
      icon: "ShoppingBag",
      sortOrder: 10,
    },
    {
      name: "Gifts & Giving",
      description:
        "Gift money, cash gifts, treating others, donations, and other social-obligation expenses",
      icon: "Gift",
      sortOrder: 11,
    },
    {
      name: "Housing",
      description:
        "Fixed housing expenses, such as rent, utilities, internet, property management, and home repairs",
      icon: "House",
      sortOrder: 12,
    },
  ],
};

export function getDefaultLedger(locale: string = "zh") {
  if (locale.startsWith("zh")) return zhLedger;
  return enLedger;
}
