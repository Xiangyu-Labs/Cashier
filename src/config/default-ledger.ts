const zhLedger = {
  settings: {
    aiLanguage: "zh-CN",
    currencies: ["CNY", "USD"] as string[],
    mainCurrency: "CNY",
    collapseEntriesDefault: false,
    aiCustomPrompt: "",
    duplicateDetectionEnabled: true,
  },
  categories: [
    {
      name: "餐饮",
      description: "涵盖日常膳食及饮水支出，包含各时段正餐、烹饪调味、各类饮品及休闲零食",
      icon: "Utensils",
      sortOrder: 1,
      isEditable: true,
    },
    {
      name: "生活",
      description:
        "指代日常居家及个人形象管理相关的消耗性开支，如日用百货、清洁耗材、通讯资费及理发美容等",
      icon: "ShoppingBag",
      sortOrder: 2,
      isEditable: true,
    },
    {
      name: "娱乐",
      description:
        "涉及休闲社交与文化活动支出，包括但不限于游戏竞技、影视观影、演出展览及相关数字订阅服务",
      icon: "Gamepad2",
      sortOrder: 3,
      isEditable: true,
    },
    {
      name: "交通",
      description: "包含各类通勤及出行费用，涵盖公共交通、网约出租、机动车燃油补给及停车管理费等",
      icon: "Bus",
      sortOrder: 4,
      isEditable: true,
    },
    {
      name: "医疗",
      description: "专项用于医疗卫生与健康保障支出，包括药品购置、医疗诊察、预防性体检及营养保健品",
      icon: "Stethoscope",
      sortOrder: 5,
      isEditable: true,
    },
    {
      name: "会员",
      description:
        "用于各类服务平台的权益订阅及会员身份维持，涉及互联网应用、专业技术接口（API）配额及健身场馆会费等",
      icon: "Crown",
      sortOrder: 6,
      isEditable: true,
    },
    {
      name: "购物",
      description:
        "指服饰配饰、数码电子、美妆护肤等个人物资的购置支出，此类开支通常具有一次性投入、长期持有的属性",
      icon: "Shirt",
      sortOrder: 7,
      isEditable: true,
    },
    {
      name: "住房",
      description:
        "涵盖房屋居住相关的各项固定开支，包括房租、公用事业费（水、电、气、网）、物业管理及家居修缮维保",
      icon: "Home",
      sortOrder: 8,
      isEditable: true,
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
    duplicateDetectionEnabled: true,
  },
  categories: [
    {
      name: "Dining",
      description:
        "Daily meals and beverages, including breakfast, lunch, dinner, cooking ingredients, various drinks, and snacks",
      icon: "Utensils",
      sortOrder: 1,
      isEditable: true,
    },
    {
      name: "Living",
      description:
        "Daily household and personal care consumables, such as groceries, cleaning supplies, communication fees, and personal grooming",
      icon: "ShoppingBag",
      sortOrder: 2,
      isEditable: true,
    },
    {
      name: "Entertainment",
      description:
        "Leisure and social activities including games, movies, shows, exhibitions, and related digital subscriptions",
      icon: "Gamepad2",
      sortOrder: 3,
      isEditable: true,
    },
    {
      name: "Transport",
      description:
        "Commuting and travel expenses including public transit, rideshare, vehicle fuel, and parking fees",
      icon: "Bus",
      sortOrder: 4,
      isEditable: true,
    },
    {
      name: "Healthcare",
      description:
        "Medical and health expenses including medications, medical consultations, preventive checkups, and nutritional supplements",
      icon: "Stethoscope",
      sortOrder: 5,
      isEditable: true,
    },
    {
      name: "Subscriptions",
      description:
        "Service platform subscriptions and memberships, including apps, API quotas, and gym memberships",
      icon: "Crown",
      sortOrder: 6,
      isEditable: true,
    },
    {
      name: "Shopping",
      description:
        "Personal items like clothing, accessories, electronics, and beauty products, typically one-time purchases for long-term use",
      icon: "Shirt",
      sortOrder: 7,
      isEditable: true,
    },
    {
      name: "Housing",
      description:
        "Housing-related fixed expenses including rent, utilities (water, electricity, gas, internet), property management, and home maintenance",
      icon: "Home",
      sortOrder: 8,
      isEditable: true,
    },
  ],
};

export function getDefaultLedger(locale: string = "zh") {
  if (locale.startsWith("zh")) return zhLedger;
  return enLedger;
}
