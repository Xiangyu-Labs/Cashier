# Cashier - Product Requirements Document (Lite)

## 1. Product Overview

**Cashier** is an AI-powered expense tracking app for people who hate manual bookkeeping. Upload a receipt photo or type a simple description — AI handles the rest.

**Core Value**: Reduce expense logging from "open app → select category → enter amount → confirm" to just "snap a photo, done."

## 2. Target Users

| User Type          | Use Case                                              |
| ------------------ | ----------------------------------------------------- |
| Casual consumers   | Quick photo after dining/shopping                     |
| Business travelers | Multi-currency receipts during trips                  |
| Light budgeters    | Want simple spending insights without complex reports |

**Not for**: Professional accountants, enterprise users, or those needing bank integrations.

## 3. Core Features

### 3.1 Authentication

- Magic Link login (passwordless via email)
- Session persists for 30 days

### 3.2 Ledger Management

- Create multiple ledgers (e.g., "Personal", "Work", "Travel")
- Set primary currency per ledger
- Configure AI language preference (Chinese/English)
- Custom AI prompts for advanced users
- Generate API keys for external integrations

### 3.3 Document Upload

- **Image upload**: Receipt photos (supports multiple images)
- **Text input**: Simple descriptions like "Starbucks 38"
- Real-time processing status display
- Retry failed documents
- Edit and resubmit text documents

### 3.4 AI Processing

- Automatic extraction of: merchant, amount, date, currency, items
- Auto-categorization based on content
- Dual-model verification for accuracy
- Anomaly flagging for unclear documents

### 3.5 Expense Entries

- View entries grouped by date
- Infinite scroll loading
- Full CRUD operations (create, read, update, delete)
- Assign/change categories
- Filter by category, date range, amount
- Link back to original document

### 3.6 Categories

- Pre-set categories: Food, Transport, Shopping, Entertainment, Other
- Create custom categories
- Emoji icons for categories
- Reorder categories

### 3.7 Currency

- Auto-detect currency from documents
- Daily exchange rate updates
- Store both original and converted amounts
- Supported: CNY, USD, EUR, JPY, GBP, HKD, TWD, KRW, etc.

### 3.8 Statistics

- Monthly spending summary (total amount, transaction count)
- Category breakdown with percentages
- All amounts converted to ledger's primary currency

### 3.9 External API

- API access via service credentials
- Enables iOS Shortcuts integration
- Supports automation tools (double-tap phone back to log expense)

## 4. User Flows

### Flow 1: Photo Upload

1. Take photo of receipt
2. Select ledger → upload
3. See "Processing" status
4. AI extracts data → entry appears in list
5. Verify or edit if needed

### Flow 2: Quick Text Entry

1. Type "Coffee 5.50"
2. AI parses: Coffee, $5.50, Food category
3. Entry created instantly

### Flow 3: iOS Shortcut (Power User)

1. Complete payment, screenshot appears
2. Double-tap phone back → auto-uploads to Cashier
3. AI processes in background
4. Entry logged without opening app

### Flow 4: Handle Anomaly

1. AI can't parse a blurry receipt
2. Document marked as "Anomaly"
3. User reviews, edits details manually
4. Retry processing or save as-is

## 5. Document States

| State        | Description                    |
| ------------ | ------------------------------ |
| `queued`     | Waiting in processing queue    |
| `processing` | AI is analyzing the document   |
| `completed`  | Entry successfully created     |
| `anomaly`    | Needs user review/confirmation |

## 6. Glossary

| Term               | Definition                                       |
| ------------------ | ------------------------------------------------ |
| Ledger             | Top-level container for financial data isolation |
| Source Document    | Original uploaded receipt/text                   |
| Ledger Entry       | Structured expense record                        |
| Category           | Classification label for entries                 |
| Anomaly            | State requiring manual confirmation              |
| Service Credential | API key for external access                      |
