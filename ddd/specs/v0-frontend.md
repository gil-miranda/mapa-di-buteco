# Spec — v0 Frontend (SPA)

**Version:** 1.0
**Date:** 2026-07-04
**Companion docs:** `api-contract-v0.md` (v1.0 — the frozen contract) · `../architecture.md` (v0.2)
**Scope:** the v0 web panel. Buildable **in parallel** with the backend by a separate agent: everything here consumes only the v0 API contract; where the backend isn't live yet, develop against a mock server generated from the OpenAPI schema.

---

## 1. Ground rules

- **Stack:** Vite + React + TypeScript. API client **generated** from `/api/v1/openapi.json` — hand-written fetch calls are a spec violation. State via a lightweight query lib (server-state cache, optimistic updates optional); no global state framework.
- **Zero business logic.** No price math, no status derivation, no matching heuristics in the front. If a rule seems needed client-side, it's a missing API affordance — file it against the backend.
- **Language:** UI 100% PT-BR. Code in English.
- **Audience:** Gil *and* two elderly owners on a desktop browser (also usable on a phone). Design consequences, non-negotiable: base font ≥ 16px, generous touch/click targets, high contrast, one primary action per screen, PT-BR labels with zero jargon ("Pedidos", never "Orders"; "Fila de revisão", never "Queue"), destructive actions always behind a confirm dialog that repeats what will happen in plain words.
- **Money/quantities:** render from centavos / decimal strings via shared formatters (single module); inputs mask as `R$ 0,00` and emit centavos.
- **Errors:** map RFC-7807 `type` URIs to PT-BR messages; unknown type → generic message + collapsible technical detail. Branching on `detail` text is forbidden (contract §4).
- **Auth:** login page → JWT in memory + localStorage; 401 anywhere → redirect to login. Single shared account in v0; build no role UI yet (role claim is read and ignored).

## 2. Information architecture

```
Sidebar (persistent):
  📋 Pedidos            → /pedidos
  🔎 Revisão (badge N)  → /revisao
  🛒 Compras            → /compras
  👥 Clientes           → /clientes
  📥 Importar iFood     → /importar
  ⚖️ Conferência        → /conferencia        (reconciliation)
  ⚙️ Cadastros          → /cadastros/*        (submenu: Produtos, Preços, Ingredientes,
                                               Fornecedores, Canais, Formas de pagamento)
  🔧 Configurações      → /config
Reserved (v1/v2, hidden in v0): /calculadora, /dre, /margens, /acoes
```

The Revisão badge = count from `GET /capture-events?status=needs_review` + entities `?needs_review=true`; polled (30 s) — no websockets in v0.

## 3. Pages

Every page defines: purpose · data · interactions · states. Common states apply everywhere: loading (skeletons), empty (friendly PT-BR guidance, e.g. "Nenhum pedido ainda — encaminhe uma mensagem para o número do sistema 📲"), error (retry button).

### 3.1 `/pedidos` — the ledger (home)

- **Data:** `GET /orders` (+ `GET /orders/summary` header widgets: total do período, nº pedidos, by-channel split).
- **Table:** data entrega · cliente (ou "—" com flag) · canal (chip) · itens resumo · total · status · pagamento (derived chip: pago/parcial/em aberto) · review flag.
- **Filters:** period (default: current month), channel, status, payment_status, needs_review, text search. Filters in the URL (shareable).
- **Row → detail drawer:** full order, items table, payments list (+ "Registrar pagamento" → `POST /orders/{id}/payments`), provenance box (raw forwarded text + link to capture event), edit (PATCH via form mirroring the contract shape), void ("Cancelar registro — isso foi um engano de digitação?" with mandatory reason) vs. cancel-status (business cancellation) — the UI explains the difference in one sentence.
- **"Novo pedido" button:** manual entry form (fallback path D) — customer picker (search + quick-create), item rows (product picker + free text fallback), values; mirrors POST contract.

### 3.2 `/revisao` — the review queue (Gil's daily 5 minutes)

- **Data:** capture events `needs_review` + flagged orders/purchases, unified list sorted oldest-first.
- **Item view (the heart):** left = the raw thing (message text / NF image via signed URL / transcript); right = the parsed draft with editable fields; product/customer/ingredient pickers pre-filled with the AI's best guess and its confidence shown as a subtle hint.
- **Actions:** `Aplicar` (POST apply with corrected parse) · `Reprocessar` (reparse) · `Descartar` (reason). Keyboard-friendly (n/p navigate, a apply) — this screen is used daily; it must be fast.
- After apply/discard → auto-advance to next item.

### 3.3 `/compras`

Mirror of `/pedidos` for purchases: list (supplier, date, total, source chip `NF`/`manual`, review flag), detail drawer (items with ingredient match status, NF image viewer, price points generated), manual purchase form. Prominent hint: "Tire foto da nota e mande no número do sistema — cai aqui sozinha."

### 3.4 `/clientes`

- List: nome/telefone, nº pedidos, último pedido, total gasto (all from API — no client math).
- Detail: order history, identities (iFood masked ids linkable via `PATCH /customer-identities`), edit, **Anonimizar (LGPD)** behind a double confirm explaining irreversibility.
- Merge duplicates: v0 = link identities only; true merge deferred (needs backend endpoint, reserved).

### 3.5 `/importar`

Upload card (drag/drop or click) + channel select → progress → **result report**: created / duplicates / error rows table (row nº + message). History list of past batches below (`GET /import-batches`). Errors are normal and non-scary: "12 linhas já existiam (tudo certo, pode mandar o mesmo arquivo de novo)".

### 3.6 `/conferencia`

Month picker → three big numbers side by side per channel: Sistema · Caderninho · Repasse iFood, with difference highlighted; inputs to type the caderninho/repasse values (PATCH). Coverage bars: % pedidos com cliente, % itens reconhecidos, % pedidos vindos de captura. This page is the **trust dashboard** — it exists to prove to the family the numbers are real.

### 3.7 `/cadastros/*`

One generic CRUD pattern instantiated per catalog (list + form drawer + archive/restore): Produtos · Preços (price list entries with validity — creating a new price shows "o preço antigo fica guardado no histórico"; 409 overlap mapped to a friendly message) · Ingredientes (with aliases editor: "apelidos que aparecem na nota") · Fornecedores · Canais · Formas de pagamento.

### 3.8 `/config` and `/login`

Config: settings form (thresholds, allowlist phones, templates — grouped, with explanations). Login: e-mail + senha, nothing else.

## 4. Shared components (build once)

MoneyInput/MoneyText · QuantityInput (decimal string) · DateBadge (delivery vs. created) · ChannelChip · StatusChip (+ derived payment chip) · NeedsReviewFlag · ConfirmDialog (repeats consequence in plain PT-BR) · EntityPicker (search + quick-create variants for customer/product/ingredient/supplier) · ProvenanceBox (raw capture → parsed record trail) · CoverageBar.

## 5. Acceptance criteria

1. `npm run build` fails if the deployed OpenAPI schema and the generated client disagree (CI step per architecture §8).
2. Every list page: loading/empty/error states present; filters URL-persisted.
3. Review queue: an NF image event can be corrected and applied end-to-end with keyboard only.
4. A manual pedido can be created in ≤ 60 s by a first-time user (owner test).
5. All money rendered from centavos — grep for float money math in the front returns nothing.
6. Voiding anything always asks for a reason and shows what will happen in PT-BR.
7. No business rule implemented client-side (review checklist item).
8. Owner usability smoke test: font sizes ≥ 16px, contrast AA, tab order sane, works at 125% browser zoom without horizontal scroll.
