/**
 * Demo data for presentations / manual QA. Creates users with items scattered around a centre point,
 * going through the real services (so fuzzing, photo processing and validation all apply).
 *
 *   npm run seed                          # around Av. Paulista, São Paulo
 *   SEED_CENTER="-22.9068,-43.1729" npm run seed   # around another city
 *
 * Every demo user has the password "troca1234". Never run against production.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../app.module.js';
import { AuthService } from '../auth/auth.service.js';
import { loadEnv } from '../config/env.js';
import { ItemsService } from '../items/items.service.js';
import { Database } from './database.service.js';
import { migrate } from './migrate.js';

const env = loadEnv();
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production environment');

const [centerLat, centerLng] = (process.env.SEED_CENTER ?? '-23.5617,-46.6560').split(',').map(Number) as [number, number];
const PASSWORD = 'troca1234';

const USERS = [
  { name: 'Ana Ribeiro', neighborhood: 'Bela Vista' },
  { name: 'Bruno Costa', neighborhood: 'Pinheiros' },
  { name: 'Carla Mendes', neighborhood: 'Vila Mariana' },
  { name: 'Diego Alves', neighborhood: 'Consolação' },
  { name: 'Elisa Prado', neighborhood: 'Moema' },
  { name: 'Fábio Nunes', neighborhood: 'Perdizes' },
];

const ITEMS: [title: string, category: string, reais: number, color: string][] = [
  ['Sofá retrátil 3 lugares', 'moveis', 1200, '#8d6e63'],
  ['Mesa de jantar 6 cadeiras', 'moveis', 1350, '#a1887f'],
  ['Geladeira frost free 375L', 'eletrodomesticos', 1500, '#90a4ae'],
  ['Micro-ondas 30L', 'eletrodomesticos', 380, '#78909c'],
  ['Air fryer 4L', 'cozinha', 350, '#ef6c00'],
  ['Jogo de panelas inox', 'cozinha', 420, '#bdbdbd'],
  ['Smart TV 43"', 'eletronicos', 1400, '#37474f'],
  ['Caixa de som bluetooth', 'eletronicos', 400, '#455a64'],
  ['Bicicleta aro 29', 'esportes', 1250, '#2e7d32'],
  ['Kit halteres 20 kg', 'esportes', 360, '#558b2f'],
  ['Furadeira de impacto', 'ferramentas', 330, '#f9a825'],
  ['Luminária de piso', 'decoracao', 300, '#ffb300'],
  ['Tapete sala 2x3 m', 'decoracao', 450, '#6d4c41'],
  ['Carrinho de bebê', 'infantil', 900, '#ad1457'],
  ['Berço com colchão', 'infantil', 1000, '#c2185b'],
  ['Coleção Harry Potter', 'livros', 320, '#5e35b1'],
  ['Cortador de grama', 'jardim', 1100, '#43a047'],
  ['Jogo de cama queen', 'cama-mesa-banho', 280, '#26a69a'],
];

/** Random point up to `maxKm` from the centre (rough degrees conversion is fine for demo data). */
function randomPoint(maxKm: number) {
  const r = maxKm * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111;
  const dLng = (r * Math.sin(theta)) / (111 * Math.cos((centerLat * Math.PI) / 180));
  return { latitude: centerLat + dLat, longitude: centerLng + dLng };
}

async function placeholderPhoto(title: string, color: string): Promise<Buffer> {
  const initials = title.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#212121"/></linearGradient></defs>
    <rect width="900" height="900" fill="url(#g)"/>
    <text x="450" y="520" font-family="Arial, Helvetica, sans-serif" font-size="260" font-weight="700"
          fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${initials}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), { logger: ['error', 'warn'] });
try {
  await migrate(app.get(Database).pool, () => undefined);
  const auth = app.get(AuthService);
  const items = app.get(ItemsService);
  const db = app.get(Database);

  let created = 0;
  for (const [u, user] of USERS.entries()) {
    const email = `demo${u + 1}@example.com`;
    if (await db.one('SELECT 1 FROM users WHERE email = $1', [email])) continue;
    const { user: account } = await auth.register({ ...user, email, password: PASSWORD });

    // Each user registers 3 items from home (same anchor) — like a real user would.
    const home = randomPoint(8);
    for (let k = 0; k < 3; k++) {
      const [title, category, reais, color] = ITEMS[(u * 3 + k) % ITEMS.length]!;
      const item = await items.create(account.id, {
        title,
        category,
        priceCents: reais * 100,
        description: 'Item de demonstração em bom estado de conservação.',
        ...home,
      });
      await items.addPhoto(account.id, item.id, await placeholderPhoto(title, color));
      created++;
    }
    console.log(`  ${email} / ${PASSWORD}  (${user.name})`);
  }
  console.log(created ? `Seed complete: ${created} items.` : 'Demo users already exist – nothing to do.');
} finally {
  await app.close();
}
