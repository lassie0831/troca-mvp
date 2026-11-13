export const CATEGORIES = [
  { slug: 'moveis', label: 'Móveis' },
  { slug: 'eletrodomesticos', label: 'Eletrodomésticos' },
  { slug: 'eletronicos', label: 'Eletrônicos' },
  { slug: 'cozinha', label: 'Cozinha e utensílios' },
  { slug: 'decoracao', label: 'Decoração' },
  { slug: 'cama-mesa-banho', label: 'Cama, mesa e banho' },
  { slug: 'ferramentas', label: 'Ferramentas' },
  { slug: 'jardim', label: 'Jardim e área externa' },
  { slug: 'infantil', label: 'Infantil' },
  { slug: 'livros', label: 'Livros e mídia' },
  { slug: 'esportes', label: 'Esportes e lazer' },
  { slug: 'outros', label: 'Outros' },
] as const;

export const CATEGORY_SLUGS: string[] = CATEGORIES.map((c) => c.slug);
