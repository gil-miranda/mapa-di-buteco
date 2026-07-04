# Discovery — Sistema de gestão para delivery de salgadinhos

> Running log of the discovery conversation. Raw material for the PRD.
> Role: Claude acts as PM + tech lead architect. Output = PRD + product specs, **no code**.

## The business (facts so far)

- 2 elderly people cook and run everything; comida caseira, operação familiar.
- Product: **salgadinhos**, sold every day.
- Volume: ~**10 pedidos/dia**.
- Channels:
  - **WhatsApp**: customer sends a message asking for their pedido; the **owner delivers it himself**.
  - **iFood**: delivery done by iFood; **higher costs** (commission etc.).

## The real pain (Gil's own words, 2026-07-04)

Not order-taking. It's **business visibility**:

- Clear view of **costs and revenue**
- Clear view of **customers and recurrence**
- Clear view of **DRE** (P&L)
- View of **purchases** (compras)
- View of **production costs**
- **Customer acquisition / retention** management

→ Reframe: this is less an order-management tool and more a **micro-gestão financeira + CRM** for a food micro-business. Channel profitability (iFood vs WhatsApp direto) is an obvious first analysis.

## Constraints / principles emerging

- Users are non-technical elderly people → system must demand near-zero new behavior from them; data capture burden is the crux.
- The interface/UX question (what they see and touch) deliberately deferred by Gil — talk later.

## Data landscape today (answers 2026-07-04, round 2)

- **Caderninho**: sales are written down, but **only the final value** — no items, no customer. The owner also transcribes iFood totals into the caderninho **weekly**.
- **iFood**: has rich per-pedido data (items, values, customer-ish info) in its portal.
- **Payments (WhatsApp channel)**: "a lot of maneiras" — many payment methods mixed (assume Pix + dinheiro + others).
- **Purchases**: the owner buys the insumos. Capture idea Gil already has: **OCR on notas fiscais + manual entries**.
- **Production costs**: an informal **spreadsheet exists** with the cost of producing a batch of each salgadinho — embryo of a ficha técnica, but the **calculation should be improved**.
- **Audience for visibility**: **both** Gil and the owners consume the reports/DRE.

→ Implications:
- We're mostly **digitizing and enriching existing habits** (caderninho, cost spreadsheet), not creating habits from zero. Except:
- **Item-level + customer-level data on the WhatsApp channel doesn't exist today.** This is the biggest data gap — the CRM/recurrence goals depend entirely on solving this capture problem.
- OCR de nota fiscal for purchases is on the table (LLM vision makes this cheap now).
- Cost spreadsheet = seed for a proper ficha técnica module (yields, embalagem, gás/energia, perdas).

## Round 3 answers (2026-07-04)

- WhatsApp account is **WhatsApp Business** (the app).
- **Customer identity**: phone number is the natural ID on WhatsApp; owners may know names. iFood customers are more anonymous (masked by platform).
- **Cost model**: build from zero, but leverage the owners' tacit knowledge — they know they produce a **"massa" of 3kg**, the **ingredient cost of that massa**, and **how many units of each salgado type** a massa yields. → Batch-based ficha técnica: massa batch (+ recheio + embalagem + fritura/energia) → per-unit cost per type.
- Caderninho granularity (per-pedido vs daily total): unknown, to verify.
- Gil didn't parse the capture-options question — re-explain concretely (done in chat, awaiting his pick).

## WhatsApp capture options (explained to Gil, awaiting reaction)

The blind spot: WhatsApp orders leave no item/customer record. Options on the table:

- **A. Encaminhar (forward-to-bot)**: owner forwards each pedido message to a "system" number; AI parses items + customer, logs automatically. One extra tap per pedido; number keeps working normally.
- **B. Official WhatsApp Business API**: system sees messages automatically, zero effort — but classically the number gets tied to the API and stops working in the normal app (coexistence is only partially/beta available). High risk of disrupting the owners' routine.
- **C. Chat export**: periodic manual export of conversations, system parses. Clunky, delayed data.
- **D. Manual entry**: Gil or owner types each pedido into a simple screen (~30s each, ~10×/day).
- **E. Unofficial WhatsApp Web bridge**: automatic, but violates ToS → ban risk on the business's main channel. Likely unacceptable.

Working recommendation: **A (forward-to-bot)**, possibly with D as fallback/correction path.

## Round 4 answers (2026-07-04) — key decisions locked

- **WhatsApp capture: Option A approved** (forward-to-bot; owner forwards each pedido message to a system number, AI parses items/customer/value; manual entry D as fallback). This is a load-bearing product decision.
- **Operating reality**: the person who answers WhatsApp, cooks, AND delivers is the **same person**. (So the forward gesture must be doable in stolen moments — between frying and driving.)
- **iFood**: they log into the **Portal do Parceiro on desktop** → data extraction via the portal's report exports (conciliação/vendas CSV/XLS) is realistic; no API dreams needed.

## Round 5 answers (2026-07-04) — discovery essentially complete

- **Meta-instruction from Gil (applies to all specs)**: don't dwell on micro definitions. The system must be **generic** — catalog, prices, salgado types are *data in the database*, not spec content. Spec the shapes, not the instances.
- **Payments**: owner **manually registers** payment. Many methods exist; model payment method as an attribute, keep confirmation manual.
- **Legal form**: **MEI**. The DRE should contain **everything** (gás, luz, embalagens, combustível da entrega própria, comissão iFood, DAS/MEI...) — a complete gerencial DRE, not a toy.
- **Retention/acquisition**: the system should **help act**, not just show insights (e.g., ready-to-send lists / drafted messages).
- **Success ("so what")**: (1) make managing the business *easier* for the owners; (2) **sell more** through augmented data; (3) **better decisions optimizing net P&L**.

## Still open (deferred, non-blocking)

- Verify caderninho granularity (per-pedido or daily total) — matters only for importing historical data.
- Interface/UX for the owners (Gil deferred: "we can talk later").
- Tech stack / architecture conversation (tech-lead phase, after PRD approval).

## Status

- Discovery done.
- **PRD v1.0 approved by Gil (2026-07-04, "lgtm")** — see `prd.md`. Approval covers module scope M1–M7, the phased MVP cut (v0 capture+ledger+purchases → v1 costs+DRE → v2 CRM+actions), and the v1 out-of-scope list.
- Next phase: **tech-lead architecture** (WhatsApp integration for the system number, stack, hosting, cost ceiling, owner-facing surface) → then per-module functional specs.
