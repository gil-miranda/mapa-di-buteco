# Spec — API Contract v0

**Version:** 1.0 (approved 2026-07-04 — §5 defaults adopted: 30-day tokens no refresh, 15-min signed media URLs, no rate limiting in v0)
**Date:** 2026-07-04
**Companion docs:** `data-model.md` (v1.0) · `../architecture.md` (v0.2) · `../prd.md` (v1.0)
**Scope:** the backend's v0 API surface — the frozen contract the frontend repo (and any agent working on it) builds against. Covers the v0 MVP cut (M1 capture, M2 ledger, M4 raw purchases) **plus all generic catalogs**. The backend authors the OpenAPI schema from this document; the schema is then the machine-checked source of truth.

---

## 1. Conventions (apply to every endpoint)

| Concern | Convention |
|---|---|
| Base path | `/api/v1` — breaking changes require `/api/v2`; additive changes are free |
| Format | JSON, UTF-8. `Content-Type: application/json` (multipart only for file/image upload endpoints) |
| Auth | `POST /api/v1/auth/login` `{email, password}` → `{access_token (JWT), expires_in}`. All other endpoints require `Authorization: Bearer <token>`. v0: single shared account; JWT carries `role` claim for the future split |
| IDs | UUID strings |
| Money | integer **centavos**, field names suffixed `_centavos` |
| Quantities | decimal **strings** (exactness over JSON float convenience), paired `unit` fields |
| Timestamps / dates | ISO-8601; timestamps UTC (`…Z`), business dates plain `YYYY-MM-DD`, competence months `YYYY-MM` |
| Envelope | Lists: `{"data": […], "meta": {"total", "limit", "offset"}}`. Single resources: bare object |
| Pagination | `?limit=` (default 50, max 200) `&offset=` |
| Filtering | Documented per resource; shared params: `?needs_review=true`, `?include_voided=true` (default false), `?include_archived=true` (default false), date ranges `?from=&to=` |
| Sorting | `?sort=field` / `?sort=-field` (descending); default `-created_at` |
| Errors | RFC-7807-style: `{"type", "title", "status", "detail", "errors": [{"field", "message"}]}`. 400 validation · 401 auth · 403 role · 404 · 409 conflict (dedupe/overlap violations) · 422 domain rule |
| Deletion semantics | **Financial records:** `DELETE` = void → requires body/param `reason`, sets `voided_at`; idempotent. **Catalogs:** `DELETE` = archive (`archived_at`); restore via `POST …/{id}/restore` |
| Mutations audit | Every PATCH/DELETE on financial records writes a `record_revisions` row (server-side, automatic) |
| Idempotency | Webhook dedupes on `wa_message_id`; imports dedupe on `(channel, external_ref)`; front POSTs may send `Idempotency-Key` header (honored for 24h) |

## 2. Resource inventory (v0)

Standard CRUD = `GET` list (filterable) · `GET /{id}` · `POST` · `PATCH /{id}` · `DELETE /{id}` (void/archive per §1).

| Resource | Path | Verbs | Notes |
|---|---|---|---|
| Auth | `/auth/login`, `/auth/me` | POST, GET | |
| Settings | `/settings` | GET, PATCH | admin role only (enforced later; open in v0) |
| Channels | `/channels` | CRUD | |
| Payment methods | `/payment-methods` | CRUD | |
| Products | `/products` | CRUD | |
| Price list | `/price-list-entries` | CRUD | POST/PATCH enforce non-overlap per `(product, channel, pack_size)` → 409; "current prices" via `?active_on=YYYY-MM-DD` |
| Customers | `/customers` | CRUD | filter `?phone=`, `?q=` (name search); `POST /customers/{id}/anonymize` (LGPD, one-way) |
| Customer identities | `/customer-identities` | CRUD | `PATCH` links/unlinks `customer_id` |
| Orders | `/orders` | CRUD | see §3.1 |
| Payments | `/orders/{id}/payments`, `/payments/{id}` | POST, GET, DELETE | amount defaults to order balance if omitted |
| Suppliers | `/suppliers` | CRUD | |
| Purchases | `/purchases` | CRUD | nested `items[]`; see §3.2 |
| Ingredients | `/ingredients` | CRUD | `aliases` managed here (feeds NF matching) |
| Ingredient prices | `/ingredients/{id}/price-points` | GET, POST | append-only; no PATCH/DELETE (correction = new point) |
| Capture events | `/capture-events` | GET, GET/{id} + actions | the review queue; see §3.3 |
| Import batches | `/import-batches` | GET, GET/{id}, POST | multipart upload; see §3.4 |
| Reports (v0 slice) | `/reports/reconciliation` | GET | see §3.5 |
| Health | `/health` | GET | unauthenticated |

Reserved for v1/v2 (paths promised, not built): `/reports/dre`, `/products/{id}/unit-costs`, `/batch-recipes`, `/yield-mappings`, `/cost-components`, `/expenses`, `/segments`, `/actions`.

## 3. Semantics that need spelling out

### 3.1 Orders

Representation (shape sketch):

```
{ id, channel_id, customer_id?, external_ref?, status,            // draft|confirmed|delivered|cancelled
  ordered_at, delivery_date?, delivery_mode,                       // own|platform|pickup
  gross_centavos, discount_centavos, delivery_fee_centavos,
  platform_fee_centavos, net_centavos,                             // net computed server-side
  payment_status,                                                  // derived, read-only: unpaid|partial|paid|overpaid
  items: [{ id, product_id?, raw_description, pack_size?, quantity,
            unit_price_centavos?, total_centavos, needs_review }],
  needs_review, raw_text?, capture_event_id?, import_batch_id?,
  voided_at?, created_at, updated_at }
```

- `POST /orders` accepts nested `items[]`; `PATCH` supports item add/update/remove via nested payload (full-replace of `items` allowed for simplicity — server diffs and preserves item ids where matching).
- Status transitions: any forward move allowed; backward moves allowed with a `record_revisions` trail (real life un-delivers). `cancelled` and void are different: cancelled = business event (counts as zero revenue); void = data mistake (excluded entirely).
- Filters: `?status=`, `?channel_id=`, `?customer_id=`, `?delivery_from/to=`, `?payment_status=`, `?needs_review=`, `?q=` (raw text/customer name).
- `GET /orders/summary?from&to&group_by=channel|delivery_date` — totals for ledger header widgets (v0's only aggregate).

### 3.2 Purchases

Nested `items[]` like orders (`ingredient_id?` + `raw_description` + `quantity`, `unit`, `quantity_canonical?`, `unit_price_centavos`, `total_centavos`, `needs_review`).
On create/update, for each item with `ingredient_id` resolved, the server **appends an `ingredient_price_point`** (source = that item) — the front never writes price points directly for purchases. Voiding a purchase does not delete its price points but marks them superseded (audit stays honest; recompute jobs skip superseded points).

### 3.3 Capture events — the review queue

- `GET /capture-events?status=needs_review` — the queue. Filters: `?kind=`, `?status=`, `?from/to=`.
- Representation: `{ id, source, kind, received_at, sender_phone?, raw_payload, media_url? (signed R2 URL, short-lived), transcript?, parse_result, confidence, prompt_version, status, error?, linked: {order_id?, purchase_id?, payment_id?} }`.
- Actions (POST, all idempotent):
  - `/capture-events/{id}/apply` — body optionally carries a **corrected** parse (same schema as `parse_result`); creates/updates the linked record and sets status `applied`.
  - `/capture-events/{id}/reparse` — re-runs the LLM with the current prompt version; appends to parse history.
  - `/capture-events/{id}/discard` — body `{reason}`; terminal.
- The webhook itself (`POST /webhooks/whatsapp` + `GET` verification handshake) is **outside** `/api/v1` and outside this contract's auth (Meta signature-verified, server-to-server). Documented in the backend repo, invisible to the front.

### 3.4 Import batches (iFood)

- `POST /import-batches` — multipart: `file` + `channel_id`. Synchronous parse (files are small): response is the batch report `{ id, format_version, row_count, created_count, duplicate_count, error_rows: [{row, message}] }`. Unknown format → 422 with detected columns in `detail` (drives the format-version fix).
- Rows dedupe on `(channel_id, external_ref)` — re-uploading the same report is safe and reports duplicates, enabling the weekly ritual to be sloppy.

### 3.5 Reconciliation report (v0's trust-builder)

`GET /reports/reconciliation?month=YYYY-MM` →
`{ month, by_channel: [{channel_id, system_gross_centavos, system_net_centavos, order_count}], capture_coverage: {orders_with_customer_pct, items_matched_pct, orders_from_capture_pct}, external_inputs: {caderninho_total_centavos?, ifood_repasse_centavos?} }`.
External inputs are manually entered via `PATCH /reports/reconciliation?month=` (stored in settings-like storage) — the point is the side-by-side, not automation.

## 4. Contract discipline (restated from architecture)

- Backend publishes the OpenAPI schema at `/api/v1/openapi.json`; the frontend repo generates its typed client from it in CI and **type-checks on every build** — drift fails the build, not the user.
- Additive = free; breaking (rename/remove/retype/semantic change) = `/api/v2` + coordinated front release. With one team (Gil + agents), the rule's value is making breakage *loud*.
- Error `type` URIs are stable identifiers (e.g. `…/errors/price-overlap`) — the front may branch on them, never on `detail` text.

## 5. Open questions

1. Token lifetime / refresh: v0 proposal = long-lived access token (30 days), no refresh flow — it's a family tool behind HTTPS; revisit if roles/panels split. OK?
2. Signed media URLs (NF images) expiry: proposal 15 min. OK?
3. Rate limiting: none in v0 beyond Railway defaults. OK?
