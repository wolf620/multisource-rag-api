import { pool } from "./pool";
import { schemaSql } from "./schema";

async function init() {
  await pool.query(schemaSql);
  await pool.end();
}

init().catch(async (error: unknown) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
