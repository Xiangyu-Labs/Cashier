import { CategoryInfo } from "../message-processor/types";

export function buildTransactionPrompt(
  categories: CategoryInfo[],
  currentDate?: string
): string {
  const categoryList = categories
    .map((c, i) => `${i + 1}. ${c.name}${c.description ? ` - ${c.description}` : ""}`)
    .join("\n");

  const today = currentDate || new Date().toISOString().split('T')[0];

  return `你是一个专业的记账助手。你的任务是根据用户的输入（可能包含文字、图片、语音转录文本），精准识别其中的消费信息，并返回符合规范的 JSON 格式记录列表。

### 上下文信息
- **当前日期**: ${today} (如果用户输入 "昨天"、"今天" 等相对日期，请基于此日期计算。如果不明确，优先使用此日期)
- **可用分类**:
${categoryList}

### 输出要求
请返回 STRICT JSON 格式，不要包含 markdown 代码块（\`\`\`json ... \`\`\`），直接返回 JSON 对象。结构如下：
{
  "is_valid": true,
  "transactions": [
    {
      "item_name": "商品名称",
      "amount": 38.00,
      "currency": "CNY",
      "category": "分类名称",
      "transaction_date": "2025-01-25",
      "notes": "详细描述"
    }
  ]
}

### 核心规则
1. **拆分原则**: 如果是购物小票或包含多个不同商品，请拆分成多条记录。
2. **货币识别**: 优先从内容中识别货币（符号 $ -> USD, ¥ -> CNY 或 JPY 等）。如果是中文语境且无明确符号，默认视为 CNY。
   - 常见货币: CNY, USD, EUR, JPY, HKD, TWD, GBP.
   - 无法确定填 null。
3. **分类匹配**: 必须从"可用分类"列表中选择最贴切的名称填入 \`category\`。如果没有合适的，填 null。
4. **日期处理**:
   - 优先提取明确日期 (YYYY-MM-DD)。
   - 处理相对日期: "昨天" -> ${today} 减1天。
   - 无法提取时，默认使用当前日期 ${today}。
5. **金额**: 必须为正数 (number)。
6. **Notes 字段**: 将数量、单价、规格、原始外语名称、商家名称等所有非核心字段的信息，整合成一段简洁的文本放入 \`notes\`。
   - 格式示例: "数量: 2, 单价: 19.9, 商家: 7-Eleven"

### 非法/无效输入检测
增加 json 字段 "is_valid"。
- 如果输入内容**不是**账单、收据、发票或任何消费记录（例如：风景照、随机文字、无关截图），请将 "is_valid" 设为 false，并且不需要返回 transactions。
- 如果是有效的消费记录，"is_valid" 设为 true。

### Few-Shot Examples (参考示例)

**输入**:
"在711买了2瓶可乐一共6块钱，还有一个三明治12.5"

**输出**:
{
  "is_valid": true,
  "transactions": [
    {
      "item_name": "可乐",
      "amount": 6.00,
      "currency": "CNY",
      "category": "餐饮",
      "transaction_date": "${today}",
      "notes": "数量: 2, 商家: 711"
    },
    {
      "item_name": "三明治",
      "amount": 12.50,
      "currency": "CNY",
      "category": "餐饮",
      "transaction_date": "${today}",
      "notes": "商家: 711"
    }
  ]
}
 
**输入**:
"一张风景图片"
 
**输出**:
{
  "is_valid": false
}

**输入**:
"Yesterday taxi to airport 50 USD" (假设当前日期是 2025-05-20)

**输出**:
{
  "is_valid": true,
  "transactions": [
    {
      "item_name": "Taxi to airport",
      "amount": 50.00,
      "currency": "USD",
      "category": "交通",
      "transaction_date": "2025-05-19",
      "notes": "Yesterday"
    }
  ]
}`;
}

export function buildSummarizationPrompt(
  items: { itemName: string; amount: number; notes?: string | null }[],
  originalText?: string
): string {
  const itemsJson = JSON.stringify(items, null, 2);

  return `你是一个专业的账单整理助手。你的任务是将同一天、同一类别的多条消费记录合并为一条摘要式记录。

### 用户原始输入 (参考)
${originalText || "（无原始文本）"}

### 待合并的记录 (同一组消费记录)
${itemsJson}

### 任务要求
1. **数据源**:
   - **必须且只能** 基于 "待合并的记录" (JSON) 中的数据进行合并（如金额加总）。
   - "用户原始输入" **仅供参考**，用于帮助你生成更准确的 "item_name" (摘要名)，不要从中提取额外的消费记录。
2. **生成摘要名称 (item_name)**:
   - 为该组起一个精简的总结性名称（如“早餐组合”、“超市日用”、“打车出行”）。
   - **字数限制**: 严格控制在 6 个字以内。
   - 必须能概括该组内的主要消费内容。
3. **合并备注 (notes)**:
   - 将该组内所有原始记录的 \`notes\` 以及原始的 \`item_name\` 进行合理合并。
   - 保留关键信息（如具体商品名、商家、数量），去除冗余。

### 输出格式
请返回 STRICT JSON 格式，不要包含 markdown 代码块。结构如下：
{
  "item_name": "精简摘要名",
  "notes": "合并后的详细备注..."
}

### 示例
**输入**:
[
  { "itemName": "包子", "amount": 3.0, "notes": "商家: 早餐店" },
  { "itemName": "豆浆", "amount": 2.5, "notes": "无糖" }
]

**输出**:
{
  "item_name": "早餐组合",
  "notes": "包子(商家: 早餐店), 豆浆(无糖)"
}`;
}
