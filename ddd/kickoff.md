# Kickoff — por onde começar a montar

**Data:** 2026-07-04 · **Companion:** `architecture.md` (v0.2) · `specs/*`
**Princípio de sequenciamento:** atacar primeiro o que tem *lead time externo* e o que é *risco integrativo* — não o que é confortável de codar.

---

## Passo 0 — Destravar dependências externas (fazer HOJE, antes de qualquer código)

Estas esperas não dependem de você e podem levar dias (risco A1):

1. **Número do sistema**: conseguir um chip/eSIM novo dedicado (nunca usado em WhatsApp).
2. **Meta Business**: criar/verificar a conta business no Meta, criar o app, registrar o número na **WhatsApp Cloud API**, gerar token e configurar o modo de webhook de teste. ← *o item de maior lead time do projeto inteiro*.
3. **Railway**: criar o projeto (serviço backend + Postgres).
4. **Cloudflare R2**: criar bucket + credenciais.
5. **Anthropic API key** para o parsing/OCR.

## Passo 1 — Walking skeleton do loop de WhatsApp (backend, semana 1)

**Não** começar pelo CRUD. Começar pela integração mais arriscada, de ponta a ponta, com o mínimo dentro:

> mensagem enviada ao número do sistema → webhook recebe → `capture_event` bruto salvo no Postgres → resposta "✅ recebi" volta no WhatsApp.

Quando esse loop funcionar no *seu* celular, o maior risco técnico do projeto morreu. Tudo o resto é terreno conhecido (CRUD, LLM, telas).

## Passo 2 — Fundação do backend + contrato (semanas 1–2)

1. Migrations do schema completo (`specs/data-model.md`) + seeds dos catálogos (canais, formas de pagamento, tipos de componente de custo).
2. Auth (login JWT) + CRUDs genéricos (`specs/api-contract-v0.md`).
3. **Publicar o OpenAPI em `/api/v1/openapi.json`** — este é o marco que libera o paralelismo: a partir daqui, o front é um projeto independente.

## Passo 3 — Front em paralelo (repo 2, outro agente, semanas 2–4)

Com o OpenAPI no ar (ou até com um mock gerado do contrato): login → cadastros → pedidos → fila de revisão → conferência, na ordem de `specs/v0-frontend.md`. Nenhuma dependência do pipeline de IA.

## Passo 4 — Inteligência da captura (backend, semanas 2–4)

Sobre o skeleton do passo 1, em ordem de valor: classificação → parsing de pedido + matching + escada de identidade → OCR de NF + price points → confirmação de pagamento → importação iFood. Testar cada etapa **com você simulando o dono** (encaminhe pedidos reais antigos, fotografe notas de verdade).

## Passo 5 — Carga inicial + dogfood (semana 4–5)

1. **Uma tarde com os donos**: cadastrar produtos, preços, ingredientes, receitas de massa e rendimentos (é também validação da discovery — os rendimentos reais vão surpreender).
2. **Uma semana de dogfood**: você opera o robô com pedidos reais repassados, ajusta prompts/matching com a fila de revisão.

## Passo 6 — Piloto com o dono (2–4 semanas)

Ensinar o gesto (encaminhar + cartão de contato + foto da nota), acompanhar pelo painel de conferência (sistema × caderninho). **Régua do gate v0: ≥90% dos pedidos capturados, ≥70% com cliente identificado** (`specs/v0-capture-ledger.md` §8.10). Passou → construir v1 (custos + DRE). Não passou → repensar a UX de captura antes de qualquer linha do v1.

## Resumo visual

```
Passo 0  ───────────────────────────────►  (verificação Meta corre em background)
Semana 1: [P1 walking skeleton WhatsApp]
Semanas 1–2: [P2 schema + CRUD + OpenAPI]──┐
Semanas 2–4: [P4 pipeline de captura]      ├─ paralelo, 2 agentes
Semanas 2–4: [P3 frontend v0]  ────────────┘
Semana 4–5: [P5 carga inicial + dogfood]
Semanas 5–8: [P6 piloto com o dono] → gate → v1
```

## Anti-padrões a evitar (combinado é combinado)

- ❌ Começar pelo DRE/calculadora "porque é a parte legal" — sem captura provada, é fachada.
- ❌ Perfeccionismo no parsing antes do piloto — a fila de revisão existe exatamente para absorver imperfeição.
- ❌ Pular o dogfood e ir direto pro dono — a primeira impressão dele com o robô só acontece uma vez.
