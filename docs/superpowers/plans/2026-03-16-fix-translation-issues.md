# Fix Pre-existing Translation Issues

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan.

**Goal:** Fix pre-existing issues in translation files: remove duplicate keys and synchronize missing translations between zh.json and en.json.

**Architecture:** Direct JSON file modifications to remove duplicates and add missing keys to maintain parity between language files.

**Tech Stack:** JSON, next-intl

---

## Issues Summary

1. **Duplicate Keys:** `TaskQueue.taskQueue` appears twice in both files (invalid JSON)
2. **Missing Keys in en.json:** Several keys exist in zh.json but not in en.json
3. **Inconsistent Key Names:** `themeSystem` vs `themeAuto` in Settings namespace

---

## Chunk 1: Fix Duplicate Keys

### Task 1.1: Remove Duplicate taskQueue Key from en.json

**Files:**
- Modify: `messages/en.json` (lines 79-80)

**Current Issue:**
```json
"TaskQueue": {
    "taskQueue": "Task Queue",
    "taskQueue": "Task Queue",  // <-- DUPLICATE
    "runningTasks": "..."
}
```

**Steps:**

- [ ] **Step 1: Remove duplicate line**

Remove line 80 (the second `"taskQueue": "Task Queue",`)

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add messages/en.json
git commit -m "fix(i18n): remove duplicate taskQueue key from en.json"
```

### Task 1.2: Remove Duplicate taskQueue Key from zh.json

**Files:**
- Modify: `messages/zh.json` (lines 80-81)

**Current Issue:**
```json
"TaskQueue": {
    "taskQueue": "任务队列",
    "taskQueue": "任务队列",  // <-- DUPLICATE
    "runningTasks": "..."
}
```

**Steps:**

- [ ] **Step 1: Remove duplicate line**

Remove line 81 (the second `"taskQueue": "任务队列",`)

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/zh.json'))"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add messages/zh.json
git commit -m "fix(i18n): remove duplicate taskQueue key from zh.json"
```

---

## Chunk 2: Synchronize Missing Keys

### Task 2.1: Add Missing Keys to en.json

**Files:**
- Modify: `messages/en.json`

**Missing Keys to Add:**

| Namespace | Key | Value |
|-----------|-----|-------|
| DetailsTab | noMore | "No more items" |
| Common | edit | "Edit" |
| Common | selectAll | "Select All" |
| Common | deselectAll | "Deselect All" |
| LedgerEntriesTab | retry | "Edit & Retry" |

**Steps:**

- [ ] **Step 1: Add `noMore` to DetailsTab**

Find DetailsTab namespace and add:
```json
"noMore": "No more items"
```

- [ ] **Step 2: Add keys to Common namespace**

Find Common namespace and add:
```json
"edit": "Edit",
"selectAll": "Select All",
"deselectAll": "Deselect All"
```

- [ ] **Step 3: Add `retry` to LedgerEntriesTab**

Find LedgerEntriesTab namespace and add:
```json
"retry": "Edit & Retry"
```

- [ ] **Step 4: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json'))"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add messages/en.json
git commit -m "fix(i18n): add missing translation keys to en.json"
```

### Task 2.2: Fix themeSystem/themeAuto Inconsistency

**Files:**
- Modify: `messages/zh.json`

**Issue:**
- zh.json uses `themeSystem` (line 294)
- en.json uses `themeAuto` for the same concept
- The en.json value is correct ("Follow System")

**Decision:** Remove `themeSystem` from zh.json since `themeAuto` already exists (line 293 in zh.json has both!)

**Steps:**

- [ ] **Step 1: Check zh.json Settings namespace**

Verify that both `themeAuto` and `themeSystem` exist in zh.json.

- [ ] **Step 2: Remove duplicate `themeSystem`**

If `themeAuto` already exists, remove the `themeSystem` line.

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/zh.json'))"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add messages/zh.json
git commit -m "fix(i18n): remove duplicate themeSystem key from zh.json"
```

---

## Chunk 3: Verification

### Task 3.1: Run Tests

**Files:**
- All modified files

**Steps:**

- [ ] **Step 1: Run lint**

```bash
npm run lint
```
Expected: No errors

- [ ] **Step 2: Run tests**

```bash
npm run test:run
```
Expected: All tests pass

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git commit -m "test: verify translation fixes pass all tests"
```

---

## Summary of Changes

| Issue | File | Action |
|-------|------|--------|
| Duplicate taskQueue | en.json | Remove line 80 |
| Duplicate taskQueue | zh.json | Remove line 81 |
| Missing noMore | en.json | Add to DetailsTab |
| Missing edit/selectAll/deselectAll | en.json | Add to Common |
| Missing retry | en.json | Add to LedgerEntriesTab |
| Duplicate themeSystem | zh.json | Remove (themeAuto exists) |

---

*Plan created: 2026-03-16*
*Estimated effort: 30 minutes*
