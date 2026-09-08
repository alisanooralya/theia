import { sql } from './connection.js';

export function lazyPrepare(query) {
  let stmt = null;
  return () => {
    if (!stmt) stmt = { query };
    return stmt;
  };
}

export { sql };
