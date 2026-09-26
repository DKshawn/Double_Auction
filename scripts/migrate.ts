import { database } from "../src/lib/server/database";
import { existsSync } from "node:fs";

async function main() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  await database();
  console.log("データベースの準備が完了しました。");
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "データベースの初期化に失敗しました。",
      error instanceof Error ? error.name : "UnknownError",
    );
    process.exit(1);
  });
