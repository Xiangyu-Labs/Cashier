# Database Schema Documentation

Cashier uses **SQLite** as its primary database, with **Drizzle ORM** for schema definition and migrations. The schema is optimized for multi-tenancy (via `ledgers`) and flexible metadata storage.

## 1. Core Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    Users ||--o{ Ledgers : owns
    Users ||--o{ PushSubscriptions : has
    Ledgers ||--o{ SourceDocuments : contains
    Ledgers ||--o{ LedgerEntries : tracks
    Ledgers ||--o{ EntryCategories : defines
    Ledgers ||--o{ ServiceCredentials : has
    Ledgers ||--o{ TaskRuns : triggers
    SourceDocuments ||--o{ LedgerEntries : generates
    EntryCategories ||--o{ LedgerEntries : classifies

    Users {
        uuid id PK
        string email
        string name
        timestamp email_verified
        string image
    }

    Ledgers {
        uuid id PK
        uuid user_id FK
        string name
        jsonb metadata
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }

    SourceDocuments {
        uuid id PK
        uuid ledger_id FK
        enum status "queued, processing, completed, anomaly"
        text text
        string[] image_urls
        date entry_date
        jsonb anomaly_codes
        timestamp created_at
        timestamp deleted_at
    }

    LedgerEntries {
        uuid id PK
        uuid ledger_id FK
        uuid source_document_id FK
        uuid category_id FK
        decimal amount
        string currency
        string item_name
        text description
        date entry_date
        jsonb metadata
        timestamp created_at
        timestamp deleted_at
    }

    EntryCategories {
        uuid id PK
        uuid ledger_id FK
        string name
        text description
        string icon
        integer sort_order
        boolean is_editable
    }

    CurrencyRates {
        date date PK
        string base
        jsonb rates
        timestamp updated_at
    }

    ServiceCredentials {
        uuid id PK
        uuid ledger_id FK
        string name
        string key
        timestamp created_at
        timestamp last_used_at
        timestamp deleted_at
    }

    PushSubscriptions {
        uuid id PK
        uuid user_id FK
        text endpoint
        text p256dh
        text auth
        text user_agent
    }
```

## 2. Table References

### `ledgers` (The Tenant Root)
Every piece of financial data belongs to a Ledger.
-   **`metadata` (JSONB)**: Stores ledger-specific settings like:
    -   `settings.mainCurrency`: The default currency.
    -   `settings.aiLanguage`: Preferred language for AI response.
    -   `settings.aiCustomPrompt`: Custom instructions for AI processing.

### `source_documents` (The Input)
Represents a raw upload (image or text) waiting to be processed.
-   **`status`**: Critical flow control field.
    -   `queued`: Waiting for worker.
    -   `processing`: Worker has picked it up.
    -   `completed`: Successfully parsed.
    -   `anomaly`: Parsed but flagged for review.

### `ledger_entries` (The Output)
The structured financial record.
-   **Relationships**:
    -   `source_document_id`: Links back to the original proof. 
    -   `category_id`: Optional link to user-defined categories.

### `entry_categories`
User-defined or system-provided categories for classifying expenses.

### `service_credentials`
API keys (`sk_live_...`) used for external service integrations.

### `push_subscriptions`
Standard Web Push subscription data for browser notifications.

### `currency_rates` (The Cache)
Daily exchange rates used for stats conversion.

## 3. Metadata & Flexibility
We use `jsonb` columns extensively (in `ledgers`, `ledger_entries`, `source_documents`) to avoid strictly coupled schema migrations for minor feature additions.

## 4. Migration Workflow
Since we use Drizzle ORM:
1.  **Edit Schema**: Modify the `schema.ts` file in the relevant feature folder.
2.  **Generate Migration**: Run `npx drizzle-kit generate`.
3.  **Apply Migration**: This happens via `npx drizzle-kit push` in dev or migration scripts in prod.
