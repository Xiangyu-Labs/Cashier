export interface DefaultCategory {
    name: string;
    description: string;
    icon: string;
    sortOrder: number;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
    {
        name: "餐饮",
        description: "日常餐饮消费，包括早餐、午餐、晚餐、饮料水果及外卖等",
        icon: "Utensils",
        sortOrder: 1,
    },
    {
        name: "日用",
        description: "生活日用品消耗，如洗护用品、清洁工具、厨房用品等",
        icon: "ShoppingBag",
        sortOrder: 2,
    },
    {
        name: "娱乐",
        description: "休闲娱乐活动，如游戏、电影、演出及会员订阅等",
        icon: "Gamepad2",
        sortOrder: 3,
    },
    {
        name: "交通",
        description: "日常交通出行，包括公交、地铁、打车、加油及停车费等",
        icon: "Bus",
        sortOrder: 4,
    },
    {
        name: "医疗",
        description: "医疗健康支出，包括药品、挂号费、体检及保健品等",
        icon: "Stethoscope",
        sortOrder: 5,
    },
    {
        name: "会员",
        description: "各类服务订阅与会员费用，如各类APP会员、健身卡等",
        icon: "Crown",
        sortOrder: 6,
    },
    {
        name: "购物",
        description: "服饰鞋帽、电子数码、美妆护肤及其他个人物品购置",
        icon: "Shirt",
        sortOrder: 7,
    },
    {
        name: "其他",
        description: "未归类或其他临时性支出",
        icon: "Package",
        sortOrder: 8,
    },
];
