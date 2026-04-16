# Social Hub — Módulo Foundry VTT

Rede social completa para servidores de TTRPG. Feed de posts, mural de missões com vagas/reservas, enquetes, cemitério com homenagens e patch notes — tudo sincronizado em tempo real via socketlib.

---

## Requisitos

| Dependência | Versão mínima |
|-------------|--------------|
| Foundry VTT | v11 |
| [socketlib](https://github.com/manuelVo/foundryvtt-socketlib) | última |
| Node.js (build) | 18+ |

---

## Instalação

### Opção A — Manifesto (recomendado)
1. Em Foundry → **Add-on Modules → Install Module**
2. Cole a URL do manifesto: `https://seu-servidor/module.json`

### Opção B — Manual
```
foundryvtt/Data/modules/foundryvtt-social/
├── module.json
├── scripts/main.js        ← bundle compilado
├── styles/social.css
├── templates/hub.hbs
└── lang/pt-BR.json
```

### Build do bundle
```bash
npm install
npm run build          # gera scripts/main.js
npm run dev            # modo watch
npm run typecheck      # apenas type-check sem emitir
```

---

## Estrutura do projeto

```
foundryvtt-social/
├── module.json                  Manifesto do módulo
├── package.json                 Dependências de build
├── tsconfig.json                Configuração TypeScript
├── rollup.config.mjs            Bundler
│
├── scripts/
│   ├── main.ts                  Entry point — Hooks, sidebar, auto-death
│   ├── types.ts                 Interfaces de dados + helpers de role
│   ├── settings.ts              game.settings + índices em memória (Map)
│   ├── sockets.ts               GM como autoridade — handlers atômicos
│   ├── api.ts                   Serviços: Post / Mission / Poll / Grave / Patch
│   ├── validation.ts            Funções puras de validação (testáveis)
│   ├── helpers.ts               Handlebars helpers
│   └── utils.ts                 randomID, sanitize, timeAgo, debounce
│
├── apps/
│   └── SocialHubApp.ts          Application shell + sub-diálogos
│
├── templates/
│   └── hub.hbs                  Template unificado com todas as abas
│
├── styles/
│   └── social.css               Tema dark-fantasy (CSS vars, sem dependências)
│
└── lang/
    └── pt-BR.json               Strings de erro localizadas
```

---

## Arquitetura — Fluxo de dados

```
Player clica "Participar"
        │
        ▼
MissionService.join()          ← api.ts (client)
        │
        ▼
socket.executeAsGM()           ← socketlib
        │
        ▼ (executa no GM)
handleMissionJoin()            ← sockets.ts
        │
        ├─ checkRateLimit()
        ├─ validateMissionJoin()
        ├─ mutação otimista na lista
        ├─ saveMissions()       ← game.settings (world)
        └─ broadcastRefresh("missions")
                │
                ▼
        Hooks.callAll("social:refresh", "missions")
                │
                ▼ (todos os clientes)
        SocialHubApp.render()
```

### Concorrência e race conditions

Todas as mutações críticas (join/leave/vote/react/respect) passam pelo GM via `socket.executeAsGM()`. O GM é o único que escreve em `game.settings`. Isso garante:

- **Atomicidade**: apenas um handler por vez (JS single-thread no GM)
- **Consistência**: sem double-join — validação lê o estado atual antes de mutar
- **Lock otimista**: rejeita se capacidade atingida entre a tentativa e a execução

---

## Modelos de dados

### Post
```typescript
{
  id: string
  authorId: string
  content: string              // sanitizado com DOMPurify
  createdAt: number            // timestamp Unix ms
  reactions: Record<string, string[]>  // emoji -> [userId, ...]
  type: "post" | "summary" | "patch"
  meta?: {
    missionId?: string         // para type=summary
    rating?: Record<string, number>  // userId -> 1-5
  }
}
```

### Mission
```typescript
{
  id, title, description,
  levelRange: [min, max],
  age: string,                 // ex: "+18", "Livre"
  platforms: string[],
  sessionDate: string,         // ISO date
  sessionTime: string,         // "HH:MM"
  maxSlots: number,
  reserveSlots: number,
  participants: string[],      // userIds confirmados
  reserves: string[],          // userIds na fila
  status: "open" | "full" | "closed",
  createdBy: string,
  createdAt: number
}
```

### Poll
```typescript
{
  id, question,
  options: [{ id, text, votes: string[] }],
  multiple: boolean,
  createdBy, createdAt,
  endsAt?: number,             // 0 = sem limite
  closed: boolean
}
```

### Grave
```typescript
{
  id, actorId?,
  name: string,
  epitaph?: string,
  deathAt: number,
  respects: string[],          // userIds (único por usuário)
  addedBy: string
}
```

---

## Regras de negócio

### Feed
- Qualquer PLAYER pode criar posts
- Reações são toggle idempotente (mesmo emoji, mesmo usuário = remove)
- Posts do tipo `summary` devem ter `meta.missionId`
- Avaliação 1–5 por usuário por missão; a média é calculada em runtime

### Missões
| Condição | Resultado |
|----------|-----------|
| `participants.length < maxSlots` | Entra em `participants` |
| `participants` cheio, `reserves.length < reserveSlots` | Entra em `reserves` |
| Ambos cheios | Rejeitado com `no_slots` |
| Saída de `participant` | Remove + promove `reserves[0]` |
| Saída de `reserve` | Remove da fila |

### Enquetes
- `multiple: false` → voto em nova opção remove voto anterior
- `multiple: true` → toggle idempotente por opção
- Expiração por tempo (endsAt) ou manual (autor/GM)

### Cemitério
- Respeito (F) é único por usuário — sem remoção posterior
- GM pode registrar manualmente ou via hook automático (HP ≤ 0)

### Chat Hook automático
Mensagem no chat contendo `[RESUMO:missionId]` cria automaticamente um post do tipo `summary` com o conteúdo restante da mensagem.

---

## Permissões por role

| Ação | PLAYER | TRUSTED | ASSISTANT | GM |
|------|--------|---------|-----------|-----|
| Criar post | ✓ | ✓ | ✓ | ✓ |
| Deletar post próprio | ✓ | ✓ | ✓ | ✓ |
| Deletar post alheio | — | — | — | ✓ |
| Criar missão | — | — | ✓ | ✓ |
| Encerrar missão | — | — | criador | ✓ |
| Criar enquete | ✓ | ✓ | ✓ | ✓ |
| Encerrar enquete | — | — | criador | ✓ |
| Registrar morte | — | — | — | ✓ |
| Publicar patch note | — | — | — | ✓ |

---

## Extensão e customização

### Adicionar nova aba
1. Novo serviço em `api.ts`
2. Nova classe App ou adicionar lógica em `SocialHubApp.ts`
3. Novo bloco `<div class="tab" data-tab="...">` em `hub.hbs`
4. Novo item em `.social-tabs` na template

### Hook personalizado de morte
O módulo detecta `updateActor` com HP ≤ 0 (compatível com D&D 5e, PF2e e sistemas similares). Para sistemas com estrutura diferente, sobreponha o hook em `main.ts`.

### Internacionalização
Adicione arquivos em `lang/` e declare-os em `module.json` na chave `languages`.

---

## Segurança

- **Sanitização**: todo conteúdo de usuário passa por `DOMPurify.sanitize()` com allowlist restrita (`b`, `i`, `em`, `strong`, `a`, `br`)
- **Autoridade GM**: todas as mutações de estado crítico executam no GM via socketlib
- **Rate limit**: 1 ação/segundo por usuário+tipo de ação (client + server)
- **RBAC**: verificação de `game.user.role` em todas as operações de escrita
- **Validação dupla**: client (api.ts) + server (sockets.ts via validation.ts)

---

## Changelog

### v1.0.0
- Feed com posts, reações emoji, resumos de sessão e avaliação de missão
- Mural de missões com vagas/reservas e promoção automática
- Enquetes single/multi-vote com expiração por tempo
- Cemitério com homenagem F única por usuário
- Patch notes custom por GM
- Detecção automática de morte via `updateActor`
- Capture de resumo via chat tag `[RESUMO:id]`