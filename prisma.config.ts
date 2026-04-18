import { config } from "dotenv";
config({ override: true });
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // For CLI operations like 'db push', we use the direct connection (5432)
    url: process.env["DIRECT_URL"],
  },
});
