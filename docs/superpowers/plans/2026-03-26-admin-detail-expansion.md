# Admin Detail Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin tasks and users tabs use a consistent row-details interaction, with a dedicated details control and full database-column visibility in the expanded detail area.

**Architecture:** Keep the list view as a compact summary table, move the row-expansion trigger into its own dedicated details column, and render full record details in an expanded panel row. Reuse the existing URL-driven expansion pattern for tasks and apply the same pattern to users so the two admin tabs behave consistently.

**Tech Stack:** Next.js App Router, React, TypeScript, next-intl, Vitest, Testing Library

---

### Task 1: Lock the new admin table behavior with failing tests

**Files:**
- Create: `tests/unit/admin/AdminTasksList.test.tsx`
- Create: `tests/unit/admin/AdminUsersList.test.tsx`
- Test: `tests/unit/admin/AdminTasksList.test.tsx`
- Test: `tests/unit/admin/AdminUsersList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the task details action in its own column", () => {
  render(<AdminTasksList ... />);
  expect(screen.getByRole("columnheader", { name: "Details" })).toBeTruthy();
});

it("renders all user columns inside the expanded user detail panel", () => {
  render(<AdminUsersList expandedUserId="user-1" ... />);
  expect(screen.getByText("Email Verified")).toBeTruthy();
  expect(screen.getByText("Updated At")).toBeTruthy();
  expect(screen.getByText("Deleted At")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/admin/AdminTasksList.test.tsx tests/unit/admin/AdminUsersList.test.tsx`
Expected: FAIL because the task details control is still embedded in the task column and the users table has no expanded full-column detail UI.

- [ ] **Step 3: Write minimal implementation**

```tsx
<th>{labels.detailsColumn}</th>
<td>
  <Link href={buildDetailHref(...)}>{isExpanded ? labels.hideDetails : labels.details}</Link>
</td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/admin/AdminTasksList.test.tsx tests/unit/admin/AdminUsersList.test.tsx`
Expected: PASS
