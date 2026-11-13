# Troca — Marketplace P2P de trocas (MVP)

Aplicativo para trocar objetos de casa com pessoas próximas, com **matching simétrico de valor (±20%)**
e **geolocalização com privacidade** (posição pública com deslocamento de até 1 km).

| Camada | Tecnologia |
|---|---|
| API | Node.js 22 · TypeScript · NestJS 12 · REST (`/v1`) |
| Banco | PostgreSQL 17 + PostGIS (`geography(Point,4326)` + índices GIST) |
| App | React Native · Expo SDK 58 · Expo Router · TanStack Query |
| Fotos | Object storage S3-compatível (Cloudflare R2, AWS S3, MinIO) |
| Qualidade | Testes unitários + E2E contra PostGIS real · CI no GitHub Actions · Docker |

---

## Escopo do MVP → onde está no código

| # | Requisito | Implementação |
|---|---|---|
| 1 | Autenticação JWT, cadastro (nome, e-mail, bairro) | [`backend/src/auth`](backend/src/auth) — access token JWT (15 min) + refresh token rotativo com detecção de reuso; senha com scrypt; rate limit |
| 2 | Cadastro de itens (título, preço, categoria, fotos, localização do aparelho) | [`backend/src/items`](backend/src/items), [`mobile/src/app/(app)/items/new.tsx`](mobile/src/app/(app)/items/new.tsx) |
| 3 | Feed de equivalência (±20% simétrico, seletor de raio, distância em 0,5 km) | [`backend/src/matching`](backend/src/matching), [`mobile/src/app/(app)/(tabs)/index.tsx`](mobile/src/app/(app)/(tabs)/index.tsx) |
| 4 | Matching geoespacial PostGIS, fuzzing ≤ 1 km persistido, posição exata só no servidor | [`backend/migrations/001_init.sql`](backend/migrations/001_init.sql), [`backend/src/locations`](backend/src/locations) |
| 5 | Proposta de troca direta com aceite/recusa | [`backend/src/proposals`](backend/src/proposals), [`mobile/src/app/(app)/proposals`](mobile/src/app/(app)/proposals) |

---

## Decisões de produto e de privacidade

### Matching simétrico de valor
Dois itens são compatíveis quando **cada um** está a no máximo ±20% do outro:
`A/1,2 ≤ B ≤ A·1,2`. Isso garante que a relação é **mútua**: se A vê B no feed, B também vê A.
Um "±20%" ingênuo não é simétrico (R$ 100 aceitaria R$ 80, mas R$ 80 não aceitaria R$ 100, pois a diferença é de 25%).
A tolerância é configurável (`PRICE_TOLERANCE_PCT`). Cálculo em centavos inteiros: [`price.ts`](backend/src/matching/price.ts).

### Localização com privacidade (LGPD)
- **A posição exata nunca sai da API.** Fica apenas na tabela `user_locations`; nenhuma resposta contém coordenadas.
- **Fuzzing persistido:** cada local recebe um ponto público deslocado de forma aleatória (CSPRNG) entre 200 m e 1 km,
  com distribuição uniforme por área. O mínimo de 200 m impede que o ponto público coincida com a casa.
- **Proteção contra "média" de pontos:** itens cadastrados a menos de 500 m de um local já existente do mesmo usuário
  **reutilizam o mesmo ponto público**. Sem isso, quem publica 10 itens de casa geraria 10 deslocamentos
  independentes, e a média deles revelaria o endereço.
- **Proteção contra triangulação:** o filtro de raio e a distância exibida usam somente o ponto **público** do outro item.
  Mudar o raio ou cadastrar itens em locais falsos revela, no máximo, o ponto público, nunca o real.
- **Distância exibida arredondada** em incrementos de 0,5 km, nunca menor que 0,5 km.
- **Fotos sem EXIF:** fotos de celular trazem GPS nos metadados. O servidor recodifica toda imagem (WebP) e descarta
  todos os metadados antes de gravar no storage ([`image-processing.ts`](backend/src/storage/image-processing.ts)).
- **Direito de exclusão:** `DELETE /v1/me` apaga conta, localizações, itens, fotos (inclusive no storage) e sessões,
  e libera os itens de terceiros que estavam reservados em trocas com o usuário.
- **Contato só após aceite:** o e-mail da outra pessoa só aparece quando a troca é aceita; antes disso, apenas o primeiro nome e o bairro.

### Fluxo da proposta
```
pending ──aceitar (destinatário)──► accepted ──concluir──► completed   (itens: traded)
   │                                   └──────cancelar──► cancelled   (itens voltam ao feed)
   ├──recusar (destinatário)──► declined
   ├──cancelar (remetente)───► cancelled
   └──(item reservado/removido em outra troca)──► unavailable
```
Ao aceitar, os dois itens ficam `reserved` e saem do feed, e as demais propostas abertas com eles passam a `unavailable`.
Aceites concorrentes são serializados com locks de linha (testado em E2E).

---

## Rodando localmente

### Opção A: Docker (recomendado)
```bash
docker compose up -d --build                          # Postgres+PostGIS, MinIO e API em http://localhost:3000
docker compose exec api node dist/database/seed.cli.js # opcional: usuários e itens de demonstração
```

### Opção B: sem Docker
Requer PostgreSQL 15+ com PostGIS.
```bash
cd backend
cp .env.example .env          # ajuste DATABASE_URL e JWT_ACCESS_SECRET
npm install
npm run build
npm run migrate
npm run seed                  # opcional
npm run dev                   # recompila e reinicia a cada alteração
```

### App
```bash
cd mobile
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://<IP-do-computador-na-rede>:3000
npm install
npx expo start                # abra no Expo Go (Android/iOS) ou pressione "w" para web
```
> No celular físico, `localhost` aponta para o próprio celular: use o IP do computador na rede local,
> tanto em `EXPO_PUBLIC_API_URL` quanto em `API_PUBLIC_URL` do backend.

Usuários de demonstração (após `seed`): `demo1@example.com` … `demo6@example.com`, senha `troca1234`.

---

## API

Base: `/v1` · autenticação `Authorization: Bearer <accessToken>` · erros no formato `{ statusCode, message }`.

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password, neighborhood }` → tokens + usuário |
| POST | `/auth/login` | `{ email, password }` → tokens + usuário |
| POST | `/auth/refresh` | `{ refreshToken }` → novos tokens (o anterior é invalidado) |
| POST | `/auth/logout` | `{ refreshToken }` |
| GET / PATCH / DELETE | `/me` | Perfil; DELETE exclui a conta (LGPD) |
| GET | `/categories` | Categorias |
| POST | `/items` | `{ title, description?, priceCents, category, latitude, longitude }` |
| GET | `/items/mine` | Meus itens |
| GET / PATCH / DELETE | `/items/:id` | Detalhe / edição / remoção (arquiva) |
| POST | `/items/:id/photos` | `multipart/form-data`, campo `file` (até 6 fotos, 12 MB) |
| DELETE | `/items/:id/photos/:photoId` | Remove foto |
| GET | `/feed?myItemId=&radiusKm=&limit=&cursor=` | Itens compatíveis com `myItemId`, ordenados por distância |
| POST | `/proposals` | `{ offeredItemId, requestedItemId, message? }` |
| GET | `/proposals?box=received\|sent&status=` | Lista |
| GET | `/proposals/:id` | Detalhe (inclui `actions` permitidas ao usuário) |
| POST | `/proposals/:id/accept` \| `decline` \| `cancel` \| `complete` | Transições |
| GET | `/health` | Healthcheck (inclui o banco) |

---

## Testes
```bash
cd backend
npm test                     # unitários: matching, fuzzing, arredondamento, senha, remoção de EXIF
DATABASE_URL=postgres://.../troca_test npm run test:e2e   # E2E com PostGIS real (o banco deve conter "test" no nome)
```
O E2E sobe a API real e cobre autenticação, rotação de tokens, privacidade da localização, upload de fotos,
feed, todo o fluxo de propostas (inclusive aceite concorrente) e exclusão de conta.

---

## Para produção
| Item | Sugestão |
|---|---|
| API | Container ([`backend/Dockerfile`](backend/Dockerfile)) em Render, Railway, Fly.io ou AWS ECS. `MIGRATE_ON_START=true` ou `npm run migrate` no deploy |
| Banco | Postgres gerenciado com PostGIS (Neon, Supabase, AWS RDS). `DATABASE_SSL=true` |
| Fotos | Cloudflare R2 (sem custo de egress) com domínio público/CDN em `STORAGE_PUBLIC_BASE_URL` |
| App | EAS Build/Submit (`eas build -p all`) para TestFlight e Play Console |
| Segurança | `JWT_ACCESS_SECRET` forte, `CORS_ORIGINS` restrito, `TRUST_PROXY=1` atrás de load balancer |

## Fase 2 (fora do MVP)
Chat interno, escrow/pagamento, troca com volta em dinheiro, troca múltipla, reputação,
notificações push e painel administrativo. A arquitetura já separa as regras (matching, privacidade,
máquina de estados da proposta) para que esses módulos sejam adicionados sem retrabalho.
