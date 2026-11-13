export interface UserRow {
  id: string;
  name: string;
  email: string;
  neighborhood: string;
  created_at: Date;
}

export interface UserView {
  id: string;
  name: string;
  email: string;
  neighborhood: string;
  createdAt: string;
}

export const USER_COLUMNS = 'id, name, email, neighborhood, created_at';

export function toUserView(row: UserRow): UserView {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    neighborhood: row.neighborhood,
    createdAt: row.created_at.toISOString(),
  };
}
