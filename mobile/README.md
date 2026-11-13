# Troca — app (Expo / React Native)

Veja o [README principal](../README.md) para arquitetura, decisões e como rodar a stack completa.

```bash
npm install
npx expo start        # Expo Go no celular (mesma rede Wi-Fi) ou "w" para web
npm run typecheck
```

Estrutura:
- `src/app/` — telas (Expo Router, rotas baseadas em arquivos)
  - `sign-in.tsx`, `register.tsx` — autenticação
  - `(app)/(tabs)/` — Explorar (feed), Meus itens, Propostas, Perfil
  - `(app)/items/new.tsx`, `(app)/items/[id].tsx`, `(app)/proposals/[id].tsx`
- `src/api/` — cliente HTTP tipado, renovação automática de sessão, armazenamento seguro de tokens
- `src/auth/` — contexto de autenticação
- `src/components/`, `src/lib/`, `src/theme.ts` — UI e utilitários
