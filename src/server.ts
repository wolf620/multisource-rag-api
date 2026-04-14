import { buildApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";

async function bootstrap() {
  const app = await buildApp();
  await app.listen({
    port: env.PORT,
    host: "0.0.0.0"
  });

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch(async (error: unknown) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
