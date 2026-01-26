import { CategoryInfo } from "../message-processor/types";

export function buildTransactionPrompt(
  categories: CategoryInfo[]
): string {
  const categoryList = categories
    .map((c, i) => `${i + 1}. ${c.name}${c.description ? ` - ${c.description}` : ""}`)
    .join("\n");

  return `你是一个记账助手。根据用户输入（可能包含文字、图片、语音），识别其中的消费信息，返回 JSON 格式的记录列表。

当前账本的分类：
${categoryList}

请返回以下格式的 JSON（不要包含 markdown 代码块，直接返回 JSON）：
{
  "transactions": [
    {
      "item_name": "商品名称",
      "amount": 38.00,
      "currency": "CNY",
      "category": "分类名称",
      "transaction_date": "2025-01-25",
      "quantity": 2,
      "unit_price": 19.00,
      "unit": "个",
      "original_name": "Product Original Name (if not in target language)",
      "notes": "关于商品的价格计算、数量或其他备注信息"
    }
  ]
}

规则：
- 如果是小票，拆分成多条记录，每个商品单独一条
- 从内容中识别货币（符号、文字、国家等线索），常见货币：CNY（人民币）、USD（美元）、EUR（欧元）、JPY（日元）、GBP（英镑）、HKD（港币）、TWD（新台币）
- 如果无法确定货币，currency 填 null
- 根据商品名称匹配最合适的分类，如果无法匹配任何分类，category 填 null
- transaction_date 尽量从输入中提取（如小票日期），格式为 YYYY-MM-DD，没有则填 null
- 金额必须是正数
- 如果商品包含数量和单价，请提取到 quantity 和 unit_price
- 如果商品原名是外语，建议在 original_name 中保留
- 识别任何关于该商品的额外信息（如价格计算方式、购买数量详情、原始名称翻译说明等），放入 notes 字段
- 只返回 JSON，不要其他文字`;
}
