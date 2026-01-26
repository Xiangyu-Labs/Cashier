export interface DefaultCategory {
    name: string;
    description: string;
    icon: string;
    sortOrder: number;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
    {
        name: "餐饮",
        description: "外卖、堂食",
        icon: "Utensils",
        sortOrder: 1,
    },
    {
        name: "日用",
        description: "消耗品",
        icon: "ShoppingBag",
        sortOrder: 2,
    },
    {
        name: "娱乐",
        description: "出去玩，游戏充值",
        icon: "Gamepad2",
        sortOrder: 3,
    },
    {
        name: "交通",
        description: "公交、地铁、打车",
        icon: "Bus",
        sortOrder: 4,
    },
    {
        name: "医疗",
        description: "药品、看病",
        icon: "Stethoscope",
        sortOrder: 5,
    },
    {
        name: "会员",
        description: "各种vip",
        icon: "Crown",
        sortOrder: 6,
    },
    {
        name: "购物",
        description: "买衣服买鞋子买手机等",
        icon: "Shirt",
        sortOrder: 7,
    },
    {
        name: "其他",
        description: "",
        icon: "Package",
        sortOrder: 8,
    },
];
