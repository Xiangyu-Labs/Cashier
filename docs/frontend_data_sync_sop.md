# Frontend Data Sync SOP

## 📋 目的

本文档定义了前端数据同步的标准操作流程，涵盖两种核心机制：

### 🔄 智能轮询（Smart Polling）
- 自动检测服务器端数据变化
- 只在必要时轮询，节省资源
- **自适应间隔**：活跃期 3 秒，冷却期（数据无变化时）10 秒
- 适用于后台任务监控、异步操作状态跟踪

### ⚡ 乐观更新（Optimistic Updates）
- 用户操作立即反馈到 UI
- 失败时自动回滚
- 适用于用户主动的 CRUD 操作

通过规范这两种机制的使用，确保：
- ✅ 用户体验流畅（即时反馈 + 自动同步）
- ✅ 错误处理一致（失败时正确回滚）
- ✅ 代码质量可维护（遵循统一模式）
- ✅ 网络资源高效利用（智能停止轮询）

---

## 🎯 适用场景判断

### ✅ 应该使用乐观更新

| 场景 | 示例 | 原因 |
|------|------|------|
| CRUD 操作 | 创建/编辑/删除分类、账单条目等 | 用户期望即时反馈 |
| Toggle 控件 | Switch、Checkbox 等 | 状态切换应即时可见 |
| 拖拽排序 | 分类排序、列表重排 | 视觉反馈必须同步 |
| 简单字段更新 | 修改名称、描述等 | 提升输入流畅度 |

### ❌ 不应该使用乐观更新

| 场景 | 示例 | 原因 |
|------|------|------|
| AI/后台任务 | GPT 生成、Worker 处理 | 需要等待异步结果 |
| 复杂业务逻辑 | 需要服务器计算的操作 | 客户端无法预测结果 |
| 文件上传 | 图片、PDF 上传 | 依赖外部资源 |
| 支付/关键操作 | 金额结算、权限变更 | 必须等待服务器确认 |

---

## 📘 Level 1: 基础标准模式

适用于 **90%** 的场景：简单列表的增删改查。

### 标准模板

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const mutation = useMutation({
  // Step 1: 定义 mutation 函数 (Actions 直接返回数据或 throw 错误)
  mutationFn: async (data) => {
    return await someAction(data);
    // 如果 Action 返回 void，直接: await someAction(data);
  },
  
  // Step 2: 乐观更新
  onMutate: async (newData) => {
    // 2.1 取消相关查询（防止被覆盖）
    await queryClient.cancelQueries({ queryKey });
    
    // 2.2 快照当前数据（用于回滚）
    const previousData = queryClient.getQueryData(queryKey);
    
    // 2.3 乐观更新缓存
    queryClient.setQueryData(queryKey, (old) => {
      // CREATE: return [...old, newItem];
      // UPDATE: return old.map(item => item.id === id ? {...item, ...newData} : item);
      // DELETE: return old.filter(item => item.id !== id);
    });
    
    // 2.4 返回上下文（用于错误回滚）
    return { previousData };
  },
  
  // Step 3: 成功回调
  onSuccess: (result) => {
    toast.success("操作成功");
    // 可选: 关闭对话框、重置表单等
  },
  
  // Step 4: 错误回调
  onError: (err, variables, context) => {
    // 4.1 回滚到之前的状态
    if (context?.previousData) {
      queryClient.setQueryData(queryKey, context.previousData);
    }
    
    // 4.2 提示用户
    toast.error(err.message || "操作失败");
  },
  
  // Step 5: 最终回调（成功或失败都执行）
  onSettled: () => {
    // 重新验证数据，确保与服务器同步
    queryClient.invalidateQueries({ queryKey });
  }
});
```

### 具体场景示例

#### 1. CREATE - 创建新条目

```typescript
const createMutation = useMutation({
  mutationFn: async (data) => createCategoryAction(ledgerId, data),
  
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['categories', ledgerId] });
    const previousCategories = queryClient.getQueryData(['categories', ledgerId]);
    
    // 添加临时条目（使用临时 ID）
    queryClient.setQueryData(['categories', ledgerId], (old = []) => [
      ...old,
      {
        id: `temp-${Date.now()}`, // 临时 ID
        ...newData,
        _isPending: true, // 可选: 标记为 pending
        createdAt: new Date().toISOString()
      }
    ]);
    
    return { previousCategories };
  },
  
  onSuccess: () => {
    toast.success("创建成功");
    // invalidate 后，临时 ID 会被服务器返回的真实 ID 替换
  },
  
  onError: (err, _, context) => {
    queryClient.setQueryData(['categories', ledgerId], context?.previousCategories);
    toast.error(err.message);
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['categories', ledgerId] });
  }
});
```

#### 2. UPDATE - 更新条目

```typescript
const updateMutation = useMutation({
  mutationFn: async ({ id, data }) => updateCategoryAction(ledgerId, id, data),
  
  onMutate: async ({ id, data }) => {
    await queryClient.cancelQueries({ queryKey: ['categories', ledgerId] });
    const previousCategories = queryClient.getQueryData(['categories', ledgerId]);
    
    // 更新指定条目
    queryClient.setQueryData(['categories', ledgerId], (old = []) =>
      old.map(category => 
        category.id === id 
          ? { ...category, ...data, _isPending: true }
          : category
      )
    );
    
    return { previousCategories };
  },
  
  onSuccess: () => {
    toast.success("更新成功");
  },
  
  onError: (err, _, context) => {
    queryClient.setQueryData(['categories', ledgerId], context?.previousCategories);
    toast.error(err.message);
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['categories', ledgerId] });
  }
});
```

#### 3. DELETE - 删除条目

```typescript
const deleteMutation = useMutation({
  mutationFn: async (id) => deleteCategoryAction(ledgerId, id),
  
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['categories', ledgerId] });
    const previousCategories = queryClient.getQueryData(['categories', ledgerId]);
    
    // 过滤掉被删除的条目
    queryClient.setQueryData(['categories', ledgerId], (old = []) =>
      old.filter(category => category.id !== id)
    );
    
    return { previousCategories };
  },
  
  onSuccess: () => {
    toast.success("删除成功");
  },
  
  onError: (err, _, context) => {
    queryClient.setQueryData(['categories', ledgerId], context?.previousCategories);
    toast.error("删除失败");
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['categories', ledgerId] });
  }
});
```

---

## 🔗 Smart Polling + 乐观更新协同模式

**适用场景**：用户操作 → 服务器响应 → 后台异步任务 → 完成后自动更新 UI

### 典型案例：创建分类 + AI 生成图标

```typescript
// 1️⃣ 使用 Smart Polling 替代普通 useQuery
const { data: categories = [] } = useSmartPolling<EntryCategory[]>({
  queryKey: ['categories', ledgerId],
  queryFn: () => getEntryCategoriesAction(ledgerId),
  // 关键：isActive 检查数据是否"未完成"
  isActive: (data) => data?.some((c) => !c.icon || !c.description) ?? false,
  interval: 3000, // 每 3 秒轮询一次
  initialData: initialCategories
});

// 2️⃣ 创建 Mutation（标准乐观更新）
const createMutation = useMutation({
  mutationFn: async (data) => createCategoryAction(ledgerId, data),
  
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['categories', ledgerId] });
    const previousCategories = queryClient.getQueryData(['categories', ledgerId]);
    
    // 乐观添加临时分类（icon/description 为 null）
    queryClient.setQueryData(['categories', ledgerId], (old = []) => [
      ...old,
      {
        id: `temp-${Date.now()}`,
        name: newData.name,
        icon: null, // ⚠️ 这将触发 Smart Polling
        description: null, // ⚠️ 这将触发 Smart Polling
        ...otherFields
      }
    ]);
    
    return { previousCategories };
  },
  
  onSuccess: () => {
    toast.success("创建成功");
  },
  
  onError: (err, _, context) => {
    queryClient.setQueryData(['categories', ledgerId], context?.previousCategories);
    toast.error(err.message);
  },
  
  // ⚠️ 关键：必须 invalidate，否则 Smart Polling 无法接管
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['categories', ledgerId] });
  }
});
```

### 工作流程图

```
用户创建分类
    ↓
onMutate: 乐观添加临时分类（icon: null, description: null）
    ↓
服务器：创建分类 + 触发后台 AI 任务
    ↓
onSettled: invalidateQueries → 触发重新获取
    ↓
Smart Polling 检测到 icon/description 为 null
    ↓
每 3 秒轮询一次，等待 AI 任务完成
    ↓
AI 任务完成：icon 和 description 已生成
    ↓
Smart Polling 检测到数据完整 → 自动停止轮询
    ↓
UI 自动更新为最终状态 ✅
```

### 关键要点

1. **`onSettled` 必须调用 `invalidateQueries`**
   - 否则 Smart Polling 不会接管

2. **Smart Polling 的 `isActive` 条件必须匹配后台任务状态**
   ```typescript
   // ✅ 正确：检查任务完成标志
   isActive: (data) => data?.some((c) => !c.icon || !c.description)
   
   // ❌ 错误：写死为 true（永远轮询）
   isActive: () => true
   ```

3. **两者必须使用相同的 `queryKey`**
   ```typescript
   const queryKey = ['categories', ledgerId];
   useSmartPolling({ queryKey, ... });
   useMutation({ ..., onSettled: () => invalidateQueries({ queryKey }) });
   ```

4. **初始数据可选**
   ```typescript
   useSmartPolling({
     queryKey,
     queryFn,
     isActive,
     initialData: initialCategories // SSR 传入的初始数据
   });
   ```

### 其他应用场景

| 场景 | isActive 条件 | 说明 |
|------|---------------|------|
| AI 生成分类图标 | `!c.icon \|\| !c.description` | 等待 AI 任务完成 |
| 文档解析 | `doc.status === 'processing'` | 等待后台 Worker 处理 |
| 文件上传 | `file.uploadProgress < 100` | 等待上传完成 |
| 支付状态 | `payment.status === 'pending'` | 等待支付确认 |

---

## 🔍 纯 Smart Polling 模式

**适用场景**：监控后台任务、查看异步操作状态等"只读"场景

### 典型案例：任务中心监控

```typescript
// ✅ 只监控任务状态，无需乐观更新
const { data: tasks = [] } = useSmartPolling({
  queryKey: ['processingTasks', ledgerId],
  queryFn: () => getProcessingTasksAction(ledgerId),
  // 只要有正在运行的任务，就持续轮询
  isActive: (data) => data?.some(t => t.status === "running" || t.status === "queued") ?? false,
  interval: 3000 // 每 3 秒检查一次
});

// Token 统计也跟随任务状态轮询
const activeTasks = tasks.filter(t => t.status === "running" || t.status === "queued");

const { data: stats } = useSmartPolling({
  queryKey: ['tokenStats', ledgerId],
  queryFn: () => getTokenStatsAction(ledgerId),
  // 当有活动任务时轮询（确保任务完成时统计数据更新）
  isActive: () => activeTasks.length > 0,
  interval: 3000
});
```

### 工作流程

```
后台任务开始（由其他操作触发）
    ↓
Smart Polling 检测到任务状态 = "running"
    ↓
开始每 3 秒轮询任务列表和统计数据
    ↓
UI 实时显示：
  - 任务进度（运行时间）
  - Token 消耗统计
    ↓
任务完成 → 状态变为 "completed"
    ↓
Smart Polling 检测到无活动任务 → 自动停止轮询
    ↓
最终数据已更新 ✅
```

### 与协同模式的区别

| 维度 | 协同模式 | 纯 Smart Polling |
|------|----------|------------------|
| **用户操作** | 创建/编辑数据 | 查看/监控状态 |
| **乐观更新** | ✅ 需要（onMutate） | ❌ 不需要 |
| **Smart Polling** | ✅ 监听数据完整性 | ✅ 监听任务状态 |
| **触发方式** | mutation → invalidate → polling | 直接 polling |
| **适用场景** | 分类管理、条目编辑 | 任务中心、进度监控 |

### 其他适用场景

| 场景 | isActive 条件 | 说明 |
|------|---------------|------|
| 任务中心 | `tasks.some(t => t.status === "running")` | 监控后台任务进度 |
| 文件上传列表 | `files.some(f => f.progress < 100)` | 等待所有文件上传完成 |
| 审批流程 | `approval.status === "pending"` | 等待审批结果 |
| 数据导出 | `export.status === "processing"` | 等待导出完成 |

---

## 📙 Level 2: 中级场景

### 场景 A: Switch/Checkbox 等即时反馈控件

**❌ 错误做法**（使用手动 state）:
```typescript
const [optimisticValue, setOptimisticValue] = useState(initialValue);

<Switch
  checked={optimisticValue}
  onCheckedChange={(value) => {
    setOptimisticValue(value);
    updateSetting(value); // 失败时需要手动回滚
  }}
/>
```

**✅ 正确做法**（使用 React Query mutation）:
```typescript
const updateMutation = useMutation({
  mutationFn: async (value) => updateSettingAction(ledgerId, { setting: value }),
  
  onMutate: async (value) => {
    await queryClient.cancelQueries({ queryKey: ['ledger', ledgerId] });
    const previousLedger = queryClient.getQueryData(['ledger', ledgerId]);
    
    queryClient.setQueryData(['ledger', ledgerId], (old) => ({
      ...old,
      metadata: {
        ...old.metadata,
        settings: { ...old.metadata.settings, setting: value }
      }
    }));
    
    return { previousLedger };
  },
  
  onError: (_, __, context) => {
    queryClient.setQueryData(['ledger', ledgerId], context?.previousLedger);
    toast.error("更新失败");
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['ledger', ledgerId] });
  }
});

// 使用时直接从 query data 读取
const { data: ledger } = useQuery({ queryKey: ['ledger', ledgerId] });

<Switch
  checked={ledger?.metadata?.settings?.setting}
  onCheckedChange={(value) => updateMutation.mutate(value)}
/>
```

### 场景 B: 无限滚动/分页数据 (useInfiniteQuery)

```typescript
const deleteMutation = useMutation({
  mutationFn: async (id) => deleteEntryAction(ledgerId, id),
  
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ['entries', ledgerId] });
    const previousPages = queryClient.getQueryData(['entries', ledgerId]);
    
    // 更新所有页面中的数据
    queryClient.setQueryData(['entries', ledgerId], (data) => {
      if (!data) return data;
      
      return {
        ...data,
        pages: data.pages.map(page => ({
          ...page,
          items: page.items.filter(item => item.id !== id)
        }))
      };
    });
    
    return { previousPages };
  },
  
  onError: (_, __, context) => {
    if (context?.previousPages) {
      queryClient.setQueryData(['entries', ledgerId], context.previousPages);
    }
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['entries', ledgerId] });
  }
});
```

### 场景 C: 关联数据同步更新

当一个操作需要同时更新多个相关缓存时：

```typescript
const deleteDocumentMutation = useMutation({
  mutationFn: async (id) => deleteSourceDocumentAction(ledgerId, id),
  
  onMutate: async (id) => {
    // 1. 取消所有相关查询
    await queryClient.cancelQueries({ queryKey: ['sourceDocuments', ledgerId] });
    await queryClient.cancelQueries({ queryKey: ['ledgerEntries', ledgerId] });
    await queryClient.cancelQueries({ queryKey: ['stats', ledgerId] });
    
    // 2. 保存所有相关数据
    const prevDocs = queryClient.getQueryData(['sourceDocuments', ledgerId]);
    const prevEntries = queryClient.getQueryData(['ledgerEntries', ledgerId]);
    const prevStats = queryClient.getQueryData(['stats', ledgerId]);
    
    // 3. 同时更新所有相关缓存
    queryClient.setQueryData(['sourceDocuments', ledgerId], 
      (old) => old?.filter(d => d.id !== id));
    
    queryClient.setQueryData(['ledgerEntries', ledgerId],
      (old) => old?.filter(e => e.sourceDocumentId !== id));
    
    // 更新统计数据（需要重新计算）
    queryClient.setQueryData(['stats', ledgerId], (old) => {
      if (!old) return old;
      const deletedEntries = prevEntries?.filter(e => e.sourceDocumentId === id) || [];
      const totalAmount = deletedEntries.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      return { ...old, total: old.total - totalAmount };
    });
    
    return { prevDocs, prevEntries, prevStats };
  },
  
  onError: (_, __, context) => {
    // 全部回滚
    if (context?.prevDocs) 
      queryClient.setQueryData(['sourceDocuments', ledgerId], context.prevDocs);
    if (context?.prevEntries) 
      queryClient.setQueryData(['ledgerEntries', ledgerId], context.prevEntries);
    if (context?.prevStats) 
      queryClient.setQueryData(['stats', ledgerId], context.prevStats);
  },
  
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['sourceDocuments', ledgerId] });
    queryClient.invalidateQueries({ queryKey: ['ledgerEntries', ledgerId] });
    queryClient.invalidateQueries({ queryKey: ['stats', ledgerId] });
  }
});
```

### 场景 D: 高频更新（需要 debounce）

```typescript
import { useDebouncedCallback } from 'use-debounce';

const updateMutation = useMutation({
  mutationFn: async (data) => updateAction(data),
  // ... 标准 onMutate/onError/onSettled
});

// 方案 A: 使用 debounce（适合自动保存）
const debouncedUpdate = useDebouncedCallback(
  (data) => updateMutation.mutate(data),
  500 // 500ms 内只触发一次
);

<Input onChange={(e) => {
  setLocalValue(e.target.value); // 本地 state 立即更新
  debouncedUpdate({ field: e.target.value }); // 延迟提交
}} />

// 方案 B: onBlur 时才提交（适合非关键字段）
<Input 
  value={localValue}
  onChange={(e) => setLocalValue(e.target.value)}
  onBlur={() => {
    if (localValue !== serverValue) {
      updateMutation.mutate({ field: localValue });
    }
  }}
/>
```

---

## 📕 Level 3: 高级场景

### 场景 A: 部分更新与服务器数据合并

当客户端只更新部分字段，但服务器可能返回更多字段（如 `updatedAt`、计算字段）：

```typescript
onMutate: async ({ id, data }) => {
  await queryClient.cancelQueries({ queryKey });
  const previousData = queryClient.getQueryData(queryKey);
  
  queryClient.setQueryData(queryKey, (old) => 
    old.map(item => item.id === id 
      ? { 
          ...item, 
          ...data, 
          _isPending: true // 标记为 pending
        }
      : item
    )
  );
  
  return { previousData };
},

// onSuccess 时用服务器数据覆盖
onSuccess: (serverData) => {
  queryClient.setQueryData(queryKey, (old) =>
    old.map(item => item.id === serverData.id 
      ? { ...serverData, _isPending: false } // 用服务器真实数据替换
      : item
    )
  );
  toast.success("保存成功");
},

// onSettled 依然 invalidate，确保最终一致性
onSettled: () => {
  queryClient.invalidateQueries({ queryKey });
}
```

### 场景 B: 并发冲突检测（乐观锁）

当多个用户可能同时编辑同一条数据时：

```typescript
const updateMutation = useMutation({
  mutationFn: async ({ id, data, version }) => {
    const result = await updateAction(id, { ...data, version });
    
    // 服务器端检查 version 是否匹配
    if (result.error === 'VERSION_CONFLICT') {
      throw new ConflictError('数据已被其他用户修改');
    }
    
    return result;
  },
  
  onMutate: async ({ id, data }) => {
    // ... 标准乐观更新
  },
  
  onError: (error, _, context) => {
    if (error instanceof ConflictError) {
      // 提示用户冲突，不回滚（让用户看到最新数据）
      toast.error('数据已被其他用户修改，请刷新后重试');
      queryClient.invalidateQueries({ queryKey });
    } else {
      // 普通错误，回滚
      queryClient.setQueryData(queryKey, context?.previousData);
      toast.error('更新失败');
    }
  }
});
```

---

## ✅ 代码审查 Checklist

在 Code Review 时，检查以下项目：

```
✅ 使用了 onMutate 钩子
✅ 调用了 queryClient.cancelQueries
✅ 保存了 previousData 到 context
✅ onError 中正确 rollback
✅ onSettled 中 invalidateQueries
✅ 没有使用手动 useState 管理乐观状态（除非有特殊原因）
✅ toast 提示清晰（成功/失败都有反馈）
✅ 临时 ID 使用 `temp-` 前缀
✅ 关联数据也进行了同步更新（如果需要）
```

---

## 🚫 常见错误

### ❌ 错误 1: 忘记 cancelQueries

```typescript
onMutate: async (data) => {
  // ❌ 没有 cancel，可能被 refetch 覆盖
  const prev = queryClient.getQueryData(queryKey);
  queryClient.setQueryData(queryKey, ...);
  return { prev };
}
```

### ❌ 错误 2: 没有保存 previousData

```typescript
onMutate: async (data) => {
  await queryClient.cancelQueries({ queryKey });
  queryClient.setQueryData(queryKey, ...);
  // ❌ 没有 return，onError 无法回滚
}
```

### ❌ 错误 3: onError 中没有回滚

```typescript
onError: (err) => {
  // ❌ 只提示错误，没有回滚 UI
  toast.error(err.message);
}
```

### ❌ 错误 4: 使用手动 state 代替 React Query

```typescript
// ❌ 不要这样做
const [optimisticValue, setOptimisticValue] = useState(initialValue);

// ✅ 应该这样做
const { data } = useQuery({ queryKey });
// 通过 mutation 的 onMutate 更新 queryClient
```

---

## 🔲 Level 4: Modal Detail Pages 响应优化

### 问题描述

当用户点击卡片打开详情 Modal 时，如果 Wrapper 组件在数据加载期间返回 `null`，会导致用户在高延迟网络下无法获得任何视觉反馈，必须等待服务器响应后 Modal 才会显示。

### ❌ 反模式

```typescript
// Wrapper 组件中
if (isLoading && !data) {
    return null; // ❌ 用户点击后无任何反馈
}
```

### ✅ 正确模式：立即显示 Modal + 骨架屏

```typescript
// Wrapper 组件
return (
    <DetailModal
        data={data ?? null}
        isLoading={isLoading}  // 传递加载状态
        ...
    />
);

// Modal 组件
{isLoading && !data && (
    <div className="p-6 space-y-4 animate-pulse">
        {/* 骨架屏内容 */}
    </div>
)}

{data && (
    <ActualContent data={data} />
)}
```

### 适用场景

| 组件类型 | 示例 |
|---------|------|
| Detail Modals | `LedgerEntryDetailModal`, `SourceDocumentDetailModal` |
| Edit Dialogs | 编辑表单对话框 |
| Preview Modals | 图片/文件预览 |

### 关键原则

1. **Wrapper 组件永远不返回 null**（除非是错误或数据被删除的情况）
2. **Modal 组件接收 `isLoading` prop**
3. **加载时显示骨架屏**，保持 Modal 结构完整

---

## 📚 参考资料

### 官方文档
- [React Query Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- [React Query Polling](https://tanstack.com/query/latest/docs/react/guides/window-focus-refetching)

### 项目内参考实现

| 场景 | 文件路径 | 说明 |
|------|---------|------|
| **协同模式** | `src/features/ledger/components/CategoriesPageClient.tsx` | 乐观更新 + Smart Polling 完整示例 |
| **纯 Smart Polling** | `src/features/ledger/components/settings/ProcessingSystemSection.tsx` | 任务中心监控示例 |
| **Smart Polling Hook** | `src/hooks/use-smart-polling.ts` | 核心实现 |
| **Modal 响应优化** | `src/features/ledger/components/LedgerEntryDetailWrapper.tsx` | Modal 立即显示 + 骨架屏示例 |
| **Modal 响应优化** | `src/features/source-document/components/SourceDocumentDetailWrapper.tsx` | Modal 立即显示 + 骨架屏示例 |

---

## 🔄 文档维护

- **创建时间**: 2026-02-02
- **最后更新**: 2026-02-04
- **维护者**: 开发团队
- **更新策略**: 遇到新场景时补充到 Level 2/3/4
