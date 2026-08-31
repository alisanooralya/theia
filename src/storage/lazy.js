import { sql } from './connection.js';

// Helper untuk query postgres.js. `sql` mendukung tag template, sehingga
// parameter ter-binding secara aman. Fungsi ini menjaga pola `run/get/all`.
export function lazyPrepare(query) {
  let stmt = null;
  return () => {
    if (!stmt) stmt = { query };
    return stmt;
  };
}

export { sql };
