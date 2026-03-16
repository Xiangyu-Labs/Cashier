export const zhLedger = {
    settings: {
        aiLanguage: "zh-CN",
        currencies: ["CNY", "USD"] as string[],
        mainCurrency: "CNY",
        collapseEntriesDefault: false,
        aiCustomPrompt: "",
    },
    categories: [
        {
            name: "餐饮",
            description: "日常餐饮消费，包括早餐、午餐、晚餐、饮料水果及外卖等",
            icon: "Utensils",
            sortOrder: 1,
            isEditable: true,
        },
        {
            name: "日用",
            description: "生活日用品消耗，如洗护用品、清洁工具、厨房用品等",
            icon: "ShoppingBag",
            sortOrder: 2,
            isEditable: true,
        },
        {
            name: "娱乐",
            description: "休闲娱乐活动，如游戏、电影、演出及会员订阅等",
            icon: "Gamepad2",
            sortOrder: 3,
            isEditable: true,
        },
        {
            name: "交通",
            description: "日常交通出行，包括公交、地铁、打车、加油及停车费等",
            icon: "Bus",
            sortOrder: 4,
            isEditable: true,
        },
        {
            name: "医疗",
            description: "医疗健康支出，包括药品、挂号费、体检及保健品等",
            icon: "Stethoscope",
            sortOrder: 5,
            isEditable: true,
        },
        {
            name: "会员",
            description: "各类服务订阅与会员费用，如各类APP会员、健身卡等",
            icon: "Crown",
            sortOrder: 6,
            isEditable: true,
        },
        {
            name: "购物",
            description: "服饰鞋帽、电子数码、美妆护肤及其他个人物品购置",
            icon: "Shirt",
            sortOrder: 7,
            isEditable: true,
        },
        {
            name: "其他",
            description: "无法归类的支出",
            icon: "Package",
            sortOrder: 8,
            isEditable: false,
        },
    ],
};

export const enLedger = {
    settings: {
        aiLanguage: "en",
        currencies: ["USD", "EUR", "GBP"] as string[],
        mainCurrency: "USD",
        collapseEntriesDefault: false,
        aiCustomPrompt: "",
    },
    categories: [
        {
            name: "Dining",
            description: "Daily dining expenses including breakfast, lunch, dinner, beverages, and takeout",
            icon: "Utensils",
            sortOrder: 1,
            isEditable: true,
        },
        {
            name: "Groceries",
            description: "Daily necessities such as toiletries, cleaning supplies, and kitchen items",
            icon: "ShoppingBag",
            sortOrder: 2,
            isEditable: true,
        },
        {
            name: "Entertainment",
            description: "Leisure activities including games, movies, shows, and subscriptions",
            icon: "Gamepad2",
            sortOrder: 3,
            isEditable: true,
        },
        {
            name: "Transport",
            description: "Daily transportation including public transit, rideshare, fuel, and parking",
            icon: "Bus",
            sortOrder: 4,
            isEditable: true,
        },
        {
            name: "Healthcare",
            description: "Medical expenses including medication, appointments, checkups, and supplements",
            icon: "Stethoscope",
            sortOrder: 5,
            isEditable: true,
        },
        {
            name: "Subscriptions",
            description: "Service subscriptions and memberships including apps, gym memberships, etc.",
            icon: "Crown",
            sortOrder: 6,
            isEditable: true,
        },
        {
            name: "Shopping",
            description: "Clothing, electronics, beauty products, and other personal items",
            icon: "Shirt",
            sortOrder: 7,
            isEditable: true,
        },
        {
            name: "Other",
            description: "Expenses that don't fit into other categories",
            icon: "Package",
            sortOrder: 8,
            isEditable: false,
        },
    ],
};

export function getDefaultLedger(locale: string = "zh") {
    if (locale.startsWith("zh")) return zhLedger;
    return enLedger;
}

/**
 * @deprecated Use getDefaultLedger(locale) for locale-specific configurations.
 * Kept for backward compatibility.
 */
export const defaultLedger = zhLedger;

export default defaultLedger;
