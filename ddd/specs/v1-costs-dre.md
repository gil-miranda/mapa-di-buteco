# Spec — v1 Functional: Production Costs + DRE

**Version:** 1.0
**Date:** 2026-07-04
**Companion docs:** `data-model.md` (v1.0, §3.6–3.7) · `api-contract-v0.md` (reserved paths) · `../prd.md` M5/M6
**Scope:** the payoff phase — the ficha técnica engine ("calculadora de receita"), expense management, and the gerencial DRE. **Precondition:** v0 pilot passed its capture bar (v0 spec §8.10) — a DRE over uncaptured data is fiction, and we refuse to ship fiction.

---

## 1. Calculadora de receita (ficha técnica engine)

### 1.1 Concepts recap (mirrors the owners' heads)

Batch recipe (massa/recheio/…) → ingredient list → batch cost from **current ingredient prices** → yield mapping (units of each product per batch) → per-unit share → + cost components (embalagem, fritura/gás, perdas %, mão-de-obra zero-valued) → **custo unitário por produto**.

### 1.2 Computation rules (normative)

- `batch_cost(recipe_version, date) = Σ ingredient.quantity × price_per_canonical_unit(ingredient, as_of=date)` where `price(as_of)` = latest non-superseded price point with `effective_date ≤ date`; ingredient with **no price point** → cost incomputable → snapshot records the gap (see 1.4).
- `unit_share(product, recipe, date) = batch_cost / units_yielded` (yield row valid at `date`). A product may consume **multiple** recipes (massa + recheio): shares sum.
- Components: `fixed_per_unit` add centavos; `pct_of_cost` apply over the running subtotal in a **defined order** (fixed first, then pct sorted by component type slug — deterministic, documented in settings). Perdas is just a pct component.
- `unit_cost(product, date) = Σ unit_shares + Σ components`, rounded half-up to centavo **only at the end**.

### 1.3 Snapshot lifecycle

- Triggers: new price point (recompute products transitively touched) · new recipe version · yield/component change · manual ("Recalcular agora") · monthly scheduled (1st, for the closing month).
- Snapshots are append-only; each stores the full breakdown JSON (recipe versions, price points, components used) — **auditable to the centavo**, and margin history never rewrites (data-model R7c).
- Consumers (margins, DRE) resolve `snapshot(product, as_of)` = latest with `effective_date ≤ as_of`.

### 1.4 Data-gap honesty

A snapshot with missing ingredient prices is stored with `complete = false` + missing list. Margin/DRE views surface incompleteness explicitly ("custo parcial — falta preço de N ingredientes") rather than showing a confident wrong number. **Rule: never render a partial cost as if complete.**

### 1.5 API (v1 additions)

`/batch-recipes` CRUD (PATCH creates a new version + supersedes; response returns both ids) · `/batch-recipes/{id}/cost?as_of=` · `/yield-mappings` CRUD (validity ranges, overlap → 409) · `/cost-component-types` CRUD · `/product-cost-components` CRUD · `/products/{id}/unit-costs?from&to` (snapshot series) · `/products/{id}/unit-costs/recompute` POST · `/reports/margins?month&channel_id` — per product: price (list, as-of) − commission (channel) − unit cost = margin absolute & %, with completeness flags.

### 1.6 Calculadora page (front)

Interactive what-if screen: pick recipe(s) + product → live breakdown card (batch cost → per-unit share → components → custo final vs. preço de venda per channel → margin). Editable *hypothetically* (change a yield, an ingredient price, a component) with a clear "simulação — nada foi salvo" banner and a "Salvar como nova versão" action. This is the owners' favorite-toy screen; it must feel like a calculator, not a form.

## 2. Expenses

- `/expenses` CRUD + `/recurring-expense-templates` CRUD (v1 additions). Scheduler materializes monthly drafts from templates (day_of_month), notifying via system number: "Contas de junho geradas — confirme os valores".
- Front: `/despesas` — month view grouped by category, fixed/variable badges, confirm-draft flow, quick add.
- Guard against double-counting (data-model resolution #4): expense categories carry `counts_in_dre: bool`; embalagem-style categories that already flow through unit costs default to `false`, with the rule explained in the UI.

## 3. DRE (gerencial, competência)

### 3.1 Computation (normative)

For month M (delivery_date in M, non-voided):

```
(+) Receita bruta        Σ orders.gross + delivery_fee            [by channel]
(−) Cancelamentos        Σ cancelled orders' gross                [business events, shown]
(−) Deduções de canal    Σ platform_fee_centavos
(=) Receita líquida
(−) CMV                  Σ over delivered order items with product_id:
                         quantity × pack_size × unit_cost_snapshot(product, as_of=delivery_date)
(=) Lucro bruto
(−) Despesas variáveis   expenses kind=variable, counts_in_dre, competence=M
(−) Despesas fixas       expenses kind=fixed, counts_in_dre, competence=M
(=) Resultado líquido
```

- Line layout/order lives in settings (`dre_line` slugs) — presentation is config, math is code.
- **Coverage block is part of the DRE payload, always:** % items with product match (CMV coverage), % orders from capture vs. manual, % snapshots complete, unmatched-item revenue total. A DRE without its coverage block is invalid by spec.
- Comparative: response includes M-1 and same-month-last-year (when data exists) per line.

### 3.2 API

`GET /reports/dre?month=YYYY-MM` (+ `?compare=true`) → lines with values, by-channel breakdown for revenue/deduções, coverage block. `GET /reports/dre/export?month=` → CSV.

### 3.3 Front

`/dre` — the statement rendered as a clean table (big numbers, PT-BR line names), channel toggle, coverage block visible (not hidden in a tooltip), month picker, CSV export. `/margens` — per-product margin table with completeness flags and "o que mudou" (margin delta vs. previous month, driven by snapshot diffs: "farinha subiu 12% em 14/06").

### 3.4 Monthly summary to the owner (WhatsApp, template)

On month close (day 1, after scheduled snapshots): short PT-BR message via system number — receita, resultado, best-seller, one notable margin change, and a link to `/dre`. Content rules: max 6 lines, numbers rounded to reais, no jargon ("sobrou", not "resultado líquido"). Template pre-approved with Meta (architecture §4.3).

## 4. Alerts (v1 slice — cost-side only; customer alerts are v2)

- **Margin drift:** on snapshot append, if margin(product, channel) crosses below threshold (settings, per-product override) → alert to Gil via system number + alert feed row. Debounce: one alert per product per week.
- **Price staleness:** weekly job; ingredients with latest price point older than N days (settings, default 45) and used in active recipes → digest message.
- `GET /alerts?status=` + `POST /alerts/{id}/dismiss` (feed shared with v2).

## 5. Acceptance criteria

1. Changing an ingredient price (new NF) recomputes exactly the affected products' snapshots within 1 min; March's DRE rerun today returns byte-identical numbers (snapshots frozen).
2. A recipe edit never mutates history: old snapshots keep referencing the superseded version; calculadora shows both versions' costs side by side.
3. A product missing any ingredient price shows "custo parcial" everywhere — no view renders it as a complete cost.
4. DRE for a pilot month reconciles: receita equals `/orders/summary` for the same filters, centavo-exact.
5. Embalagem configured as unit-cost component does **not** also appear in despesas variáveis (double-count guard verified by test fixture).
6. CMV coverage < 80% renders a visible warning banner on `/dre` ("números parciais — X% dos itens sem produto identificado").
7. Calculadora simulation changes save nothing unless explicitly saved as a new version.
8. Owner receives the monthly summary; content obeys the 6-line/no-jargon rules.
