import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const DB_PATH = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'loisirs.db');
export const PORT = Number(process.env.PORT) || 3000;
