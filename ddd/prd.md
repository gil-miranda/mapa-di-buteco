# PRD — Sistema de Gestão para Micro-Delivery de Salgados

**Version:** 1.0 (approved)
**Date:** 2026-07-04
**Authors:** Gil (product owner) + Claude (PM / tech lead)
**Status:** 🟢 Approved by Gil on 2026-07-04 ("lgtm") — including the MVP cut in §10.1 (v0 = capture + ledger + purchases; v1 = costs + DRE; v2 = CRM + actions) and the v1 out-of-scope list in §6
**Companion doc:** `discovery.md` (raw discovery log)

---

## 1. Vision

A management system for a family-run food micro-business (2 elderly owner-operators selling salgados daily via WhatsApp and iFood) that gives the family **complete financial and customer visibility** — a real gerencial DRE, true production costs, and customer recurrence — while demanding **near-zero new behavior** from the owners.

The system doesn't replace how they work. It **listens to how they already work** (WhatsApp messages, notas fiscais, iFood portal reports, batch-based cost intuition) and turns that exhaust into structured data and actionable decisions.

**North star:** optimize the business's **net P&L** and make the owners' lives easier — never the other way around.

## 2. Problem

The operation runs fine day-to-day (~10 pedidos/dia), but the business is **flying blind**:

| Question | Can they answer today? |
|---|---|
| Did we profit this month, and how much? | No — caderninho has only final sale values |
| What does one salgado really cost to produce? | Roughly — informal spreadsheet, stale prices, incomplete costs |
| Who are our customers? Who stopped ordering? | No — WhatsApp orders leave no record; iFood is anonymous |
| Is iFood worth its commission vs. own delivery? | No — channels are never compared |
| What did we spend on insumos this month? | No — purchases aren't recorded |

The root cause is a **data capture gap**, not a management-skill gap. Nobody can run a DRE on data that was never captured.

## 3. Users & personas

| Persona | Who | Relationship with the system |
|---|---|---|
| **Owner-operator** | One of the 2 owners; answers WhatsApp, cooks, AND delivers (same person). Elderly, non-technical, but disciplined (keeps a caderninho, transcribes iFood weekly). | Interacts almost exclusively **through WhatsApp**: forwards pedido messages, sends photos of notas fiscais, registers payments. Consumes simple summaries. |
| **Second owner** | Cooks. | Indirect user; possibly no interaction at all. |
| **Gil (admin/analyst)** | Family member, technical. Product owner. | Full access: dashboards, DRE, corrections, configuration, imports, campaign actions. The system's safety net. |

Both the owner and Gil consume the visibility outputs (reports/DRE), at different depths.

## 4. Product principles

1. **Zero new behavior (quase).** The only new gestures asked of the owner: forward a WhatsApp message, photograph a nota fiscal, confirm a payment. Anything more belongs to Gil or the system.
2. **Generic by design.** Products, prices, ingredients, channels, payment methods are **rows in the database**, never spec constants. The spec defines shapes, not instances. (Explicit direction from Gil.)
3. **Capture is sacred; correction is cheap.** The AI parses messy input and never blocks on ambiguity — it records with a confidence flag and lets Gil (or a single short question back to the owner) fix it later. A slightly wrong pedido recorded beats a perfect pedido lost.
4. **One front door.** WhatsApp (a dedicated "system" number) is the universal capture channel: pedidos, notas fiscais, payment confirmations, voice notes. Meet the users where they live.
5. **Mirror their mental model.** Costs are computed the way the owners think: *massa batches with per-type yields*, not abstract BOMs.
6. **DRE completo, gerencial.** Everything enters the P&L: CMV, embalagens, comissão iFood, combustível da entrega própria, gás, luz, DAS (MEI). Honest numbers or no numbers.
7. **Insight → action.** Visibility features must terminate in an action the family can take (message these customers, change this price, prefer this channel).

## 5. Scope — functional modules

### M1. Capture (the WhatsApp robô + imports)
The system's front door. A dedicated WhatsApp number backed by an AI agent.

- **Pedido capture:** owner forwards a customer's order message → AI extracts customer (phone/name), items, quantities, values, delivery date → creates a draft pedido. Handles messy, partial, multi-message forwards. May ask **at most one** short clarifying question; otherwise records with `needs_review` flag.
- **Nota fiscal capture:** owner (or Gil) sends a photo of a nota/cupom → OCR/vision extracts merchant, items, quantities, unit prices → creates a purchase record and **updates ingredient price history**.
- **Payment registration:** owner confirms payment ("pago, pix") via quick reply or short message; method recorded as data.
- **Voice & free-text tolerance:** accepts voice notes and loose phrasing ("vendi 3 cento hoje pra dona Maria").
- **iFood import:** periodic (weekly) upload of Portal do Parceiro report exports (vendas/conciliação) — via desktop upload by Gil or the owner's existing weekly ritual, redirected. Creates pedidos with channel = iFood, including commission costs.
- **Manual entry & correction (fallback):** simple screens for Gil to enter/fix anything the robô got wrong or missed.

### M2. Pedidos & revenue ledger
Canonical record of every sale, whatever the channel.

- Pedido: customer, channel (whatsapp | ifood | other — extensible), items, values, delivery mode (own | platform), payment (method, status, timestamps), fulfillment date.
- Statuses kept minimal (this is a ledger, not an ops board): draft → confirmed → delivered → paid (order-independent; real life is messy).
- Reconciliation view: system total vs. caderninho vs. iFood repasse, to build trust in the numbers.

### M3. Customers & recurrence (CRM)
- Customer identity anchored on **phone number** (WhatsApp); name optional; iFood customers tracked as channel-scoped identities (anonymous is OK — still counts for volume/mix analysis).
- Per-customer: order history, frequency, ticket médio, favorite items, last order date, lifetime value.
- Segments computed automatically: novos, recorrentes, em risco (sumidos), perdidos — thresholds configurable, not hardcoded.

### M4. Purchases & insumos
- Purchase records (from NF OCR + manual entry): supplier, items, quantities, prices, date.
- Ingredient catalog (generic, DB-driven) with **price history** — the live feed that keeps production costs honest.
- Monthly purchase totals feed the DRE directly (and enable CMV vs. compras sanity checks).

### M5. Production costs (ficha técnica engine)
Mirrors the owners' batch mental model:

- **Batch (massa) definitions:** a batch = list of ingredient quantities (e.g., "massa 3kg") → cost derived from current ingredient prices.
- **Yield mappings:** batch → N units per salgado type (e.g., 1 massa → 120 coxinhas *ou* 90 esfihas).
- **Per-unit cost composition:** massa share + recheio + embalagem + fritura/gás/óleo + perdas (%) — all components generic and configurable.
- Costs are **snapshotted over time**: when ingredient prices change (via M4), unit costs recompute; history preserved for honest margin analysis.
- **Margin view:** price vs. true cost per product per channel (iFood price − commission vs. WhatsApp price).

### M6. DRE & dashboards
The payoff module. Gerencial DRE per month (and custom periods):

- **Receita** by channel → (−) deduções/comissão iFood → (−) CMV (from M5 costs × M2 volumes) → (−) despesas variáveis (embalagem, combustível entrega própria) → (−) despesas fixas (gás, luz, DAS-MEI, etc. — configurable expense categories) → **Resultado líquido**.
- Channel profitability: iFood vs. WhatsApp, fully loaded.
- Product profitability: margin per salgado type, mix analysis.
- Trends: revenue, cost, and margin over time.
- Consumable by **both** Gil (full dashboards) and the owner (simple periodic summary — e.g., a monthly WhatsApp message from the robô: "Junho: vendeu R$ X, sobrou R$ Y").

### M7. Retention & growth actions
Insight that terminates in action:

- **Alerts:** "8 clientes recorrentes não pedem há 30+ dias", "margem da coxinha caiu abaixo de X% (farinha subiu)".
- **Ready-to-act lists:** re-engagement lists with **drafted messages** the owner (or Gil) can send — the system prepares, a human sends (avoids spam/automation risk on the main number).
- **Suggestions:** repricing candidates when cost drift erodes margin; product-mix and channel-steering hints.

## 6. Out of scope (v1)

- Kitchen/production operations (order queue, preparation workflow) — the operation already works.
- Automated messaging *from* the main business number (ban risk; humans send).
- Route optimization for deliveries.
- Fiscal/accounting compliance output (DRE is gerencial; MEI obligations stay as-is).
- Inventory/stock control of ingredients (purchases are tracked for cost, not stock balance) — *candidate for v2*.
- Online menu / customer-facing ordering — *possible future; explicitly not now*.

## 7. Conceptual data model (shapes, not instances)

All catalogs are data, not code. Core entities:

- **Product** (salgado type; unit of sale — unidade/cento/etc. as data), **PriceListEntry** (per channel, time-versioned)
- **Customer** (phone-anchored; channel identities), **Order**, **OrderItem**, **Payment** (method as data)
- **Channel** (whatsapp, ifood, … extensible), **DeliveryMode** (own, platform)
- **Ingredient**, **Purchase**, **PurchaseItem**, **IngredientPricePoint** (history)
- **BatchRecipe** (massa/recheio), **YieldMapping** (batch → product units), **CostComponent**, **UnitCostSnapshot**
- **ExpenseCategory** (fixed/variable, DB-driven), **Expense**
- **CaptureEvent** (raw forwarded message / NF image / voice note + AI parse + confidence + review status) — the audit trail behind every record

## 8. Success criteria

| Goal (Gil's words) | Measurable proxy |
|---|---|
| Make life easier to manage | Owner's effort ≤ today's (caderninho ritual replaced, not added to); Gil's manual bookkeeping < 30 min/week |
| Clear view of the business | A trustworthy monthly DRE exists within 2 months of go-live; ≥ 90% of pedidos captured with items+customer |
| Sell more through augmented data | Re-engagement actions taken monthly; recovered "sumidos" measurable; revenue trend visible |
| Optimize net P&L | At least one data-driven decision per quarter (reprice, channel shift, mix change) with measured impact |

## 9. Risks & assumptions

| # | Risk / assumption | Mitigation |
|---|---|---|
| 1 | **Owner actually forwards messages** (load-bearing). | Make it one gesture; robô tolerant of anything; Gil fallback; monitor capture rate vs. caderninho totals. |
| 2 | AI parsing of messy PT-BR pedidos is imperfect. | `needs_review` queue; confidence flags; reconciliation vs. caderninho; correction is cheap by design. |
| 3 | iFood portal export format changes / no API. | Imports are file-based and format-versioned; worst case, weekly manual entry of a small volume. |
| 4 | Cost model garbage-in (stale ficha técnica). | NF OCR keeps ingredient prices live automatically; drift alerts. |
| 5 | System outlives Gil's attention (bus factor / maintenance). | Keep architecture radically simple (tech-lead phase); degrade gracefully to "just a ledger". |
| 6 | WhatsApp policy risk on the *system* number. | System number is separate from the business number; used for capture (inbound-heavy), humans send outbound campaigns from the main number. |

## 10. Open questions — resolutions (2026-07-04)

1. **MVP cut** — ✅ approved as proposed: **v0** = M1 (pedido capture + NF OCR) + M2 + M4 raw records; **v1** = M5 + M6 (costs + DRE); **v2** = M3 segments + M7 actions.
2. **Owner-facing surface** — ✅ decided: **web interface for everyone** (owners + Gil, single shared panel for now; per-role panels maybe later). Owners will cadastrar coisas and use the calculadora de receita on the web. Capture remains WhatsApp-first. *(Supersedes the "WhatsApp-only for owner" hypothesis.)*
3. Historical backfill: still open — depends on caderninho granularity (unverified, non-blocking).
4. **Tech architecture** — ✅ see `architecture.md`: Railway, official WhatsApp Cloud API on a dedicated system number, Python monolith proposal, budget ceiling R$ 100/month (est. R$ 30–60).
5. Name for the product/robô — still open 🙂
