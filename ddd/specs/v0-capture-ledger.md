# Spec — v0 Functional: Capture + Ledger + Purchases

**Version:** 1.0
**Date:** 2026-07-04
**Companion docs:** `data-model.md` (v1.0) · `api-contract-v0.md` (v1.0) · `../architecture.md` (v0.2)
**Scope:** backend behavior for the v0 MVP cut — M1 (WhatsApp robô + NF OCR + iFood import), M2 (pedido/revenue ledger), M4 (raw purchase records). The v0 goal is explicit: **prove the capture loop works in real life for 2–4 weeks** before building costs/DRE on top.

---

## 1. The robô — conversation contract

### 1.1 Who may talk to it

Only phones in the `settings` allowlist (owner, Gil). Any other sender receives one polite PT-BR refusal (template `not_authorized`) and the event is stored as `discarded` (kind `other`). The robô **never** talks to customers. This is a hard security boundary — the system number will leak eventually; it must be inert to strangers.

### 1.2 Inbound kinds and classification

Every inbound message becomes a `capture_event` **before any processing** (capture is sacred — webhook handler persists raw payload + downloads media to R2, acks Meta, then processing is async).

Classification (LLM, one cheap call; media type narrows first):

| Signal | kind | Pipeline |
|---|---|---|
| Forwarded/pasted text describing an order | `order` | §2 order parsing |
| Image of nota fiscal / cupom / receipt | `nf` | §3 NF OCR |
| Image that is not a document | `other` | needs_review (human decides) |
| Short text about payment ("pago…", "recebi pix…") | `payment_confirmation` | §4 payment linking |
| Contact card (vCard) | `contact_card` | §2.3 identity resolution |
| Voice note | transcribe first (LLM audio), then reclassify transcript | per result |
| Anything else / low classification confidence | `other` | needs_review |

### 1.3 Conversation rules

- **Stateless by default.** Each event processes independently. The single exception:
- **Pending-question state:** when the robô asks its one allowed clarifying question (§2.3), it records a pending link `{sender, question_type, target_record, expires: 30min}`. The next message from that sender is first tested as an answer to the pending question; on match it resolves, otherwise the pending link is dropped (target stays `needs_review`) and the message processes normally.
- **At most one question per capture event, ever.** Everything else unresolved → `needs_review` flag, silent.
- **Always acknowledge.** Every applied capture gets a one-line PT-BR confirmation (see templates). No reply is a bug — the owner must trust that "sent = recorded".
- Reply templates live in settings (versioned); examples below are **illustrative, not normative**:
  - order applied: `✅ Anotado: {items_summary} — {customer_name|"cliente a confirmar"}, {delivery_date|"sem data"} — R$ {total}`
  - order needs review: `✅ Anotado (vou conferir uns detalhes com o Gil): {best_effort_summary}`
  - nf applied: `🧾 Compra registrada: {supplier}, R$ {total}, {n} itens`
  - clarifying question: `Esse pedido é de quem?`
  - payment applied: `💰 Pago ({method}) — pedido de {customer_name}`

## 2. Order capture pipeline

### 2.1 Parse schema (LLM structured output, schema-versioned)

```
{ customer_hint: {name?, phone?} | null,
  items: [{ description, quantity?, pack_hint?, unit_price_centavos?, total_centavos? }],
  order_total_centavos?, delivery_date?, delivery_mode_hint?, payment_hint?,
  notes?, confidence: { overall, customer, items, values } }   // each 0–1
```

Multi-message forwards: consecutive `order` events from the same sender within a settings-defined window (default 3 min) referencing the same order context are merged into one draft order (LLM decides continuation vs. new order; below threshold → two orders + needs_review).

### 2.2 Matching rules (deterministic first, LLM assist second)

- **Products:** normalize → exact/alias match against `products` (+ `price_list_entries.pack_label` for pack words like "cento") → fuzzy ≥ threshold (settings, default 0.85) → else LLM shortlist pick with its own confidence → else `product_id = null`, `raw_description` kept, item `needs_review`.
- **Prices:** if item price absent, fill from current `price_list_entries` for the channel; if present and diverging > tolerance (settings, default 15%) from list price → keep the *stated* price, flag `needs_review` (the human said a number; respect it, verify later).
- **Customers:** `customer_hint.phone` → exact match or create. Name only → exact (case/accents-insensitive) match on `customers.name`; multiple/no match → §2.3 ladder. **Never fuzzy-create customers** — recurrence data quality dies by duplicate.

### 2.3 Identity ladder (the forwarded-message gap)

In order: (a) phone/name resolved from content → done. (b) A `contact_card` event from the same sender within the merge window → attach (create customer if new). (c) Ask the one question (`Esse pedido é de quem?`); answer matched as name/phone/contact card. (d) Unresolved → order stands with `customer_id = null`, `needs_review`. **Capture never blocks on identity.**

### 2.4 Result

Draft order created with `status = confirmed` (the owner only forwards real orders; `draft` is reserved for API-created WIP), `capture_event_id` set, `needs_review` per rules above. Confirmation sent per §1.3.

## 3. NF capture pipeline

1. Image → R2; OCR via LLM vision, structured output: `{ supplier: {name?, cnpj?}, purchased_at?, total_centavos?, items: [{description, quantity, unit, unit_price_centavos?, total_centavos?}], confidence }`.
2. Supplier: match by CNPJ, else fuzzy name ≥ threshold, else create (suppliers are low-risk to auto-create, unlike customers).
3. Items → ingredient matching via `ingredients.aliases` (exact → fuzzy → LLM shortlist → null + needs_review). Unit conversion to canonical (dictionary in settings: kg→g, L→ml, dz→un…); unknown unit → item needs_review.
4. Arithmetic check: Σ items vs. NF total; divergence > 2% → purchase `needs_review`.
5. Purchase created; **resolved items append `ingredient_price_points`** (per api-contract §3.2). Confirmation sent.

## 4. Payment confirmation pipeline

Parse: `{customer_hint?, order_hint?, method_hint?, amount_centavos?}`. Order resolution ladder: explicit hint → single open (unpaid/partial, non-cancelled) order for that customer → if exactly one open WhatsApp-channel order exists at all, use it → else needs_review. Method matched against `payment_methods` aliases; amount defaults to order balance. Applied payments confirm per §1.3.

## 5. iFood import (file-based)

- Parser registry keyed by `format_version`, detected from header columns. Unknown → 422 with detected columns (api-contract §3.4); adding a new format version is a small, isolated change (risk A3).
- Each row → order upsert: `channel = ifood`, `external_ref` = iFood order id (dedupe key), items when the report has them (else one consolidated item, `needs_review = false` — consolidated is expected for some report types), `platform_fee_centavos` from commission/fee columns, `delivery_mode = platform`, status from report status (cancelled rows → `cancelled`, kept — they're business events).
- Customer: masked id → `customer_identities` upsert (`customer_id` null).
- Import report response per api-contract; batch row in `import_batches`.

## 6. Review queue semantics (backend side)

- Anything flagged lands in `GET /capture-events?status=needs_review` **and/or** entity-level `needs_review` filters (orders/purchases/items) — the queue view joins both.
- `apply` with corrected parse: creates/updates linked records **and** feeds the correction log (`record_revisions`) — this is also the future eval set for prompt improvements (every human correction is a labeled example; prompt_version recorded on every parse).
- Clearing the last `needs_review` item on an entity clears the entity flag.

## 7. Failure behavior

| Failure | Behavior |
|---|---|
| LLM API down/erroring | Event stays `received`; retry with backoff (schedule: 1m, 5m, 30m, then hourly ≤ 24h); owner still gets `✅ Recebi, registrando…` ack so trust survives |
| Webhook down (deploy/crash) | Meta retries; dedupe on `wa_message_id` makes retries safe; worst case the owner re-forwards (also deduped by content+window heuristic → needs_review if suspected duplicate) |
| Media download fails | Event `needs_review` with error; raw payload kept for retry |
| Parse succeeds, apply violates a constraint | Event `needs_review` with the 409/422 detail attached |

## 8. Acceptance criteria (testable, v0 exit bar)

1. A forwarded multi-item pedido text becomes a confirmed order with items, in ≤ 60 s, with a WhatsApp confirmation back.
2. A pedido with an unknown product still becomes an order (item unmatched, flagged) — never dropped.
3. Identity ladder: contact-card-after-forward attaches the right customer; unanswered question leaves order recorded + flagged.
4. An NF photo becomes a purchase whose resolved items produce ingredient price points; Σ check flags divergent NFs.
5. "pago pix" style message settles the right open order ≥ 90% of the time in the pilot; misses land in review, never on the wrong order silently above threshold.
6. Re-uploading the same iFood report creates zero duplicates and says so.
7. Killing the LLM key mid-day loses **zero** capture events; all recover on retry.
8. A stranger messaging the robô gets one refusal and creates no reviewable noise.
9. Reconciliation report returns for any month with data, with coverage percentages.
10. **Pilot success bar (the real v0 gate): ≥ 90% of WhatsApp pedidos in the pilot window exist in the system with items; ≥ 70% with resolved customer.** Below that → rework capture UX before building v1 on top.
