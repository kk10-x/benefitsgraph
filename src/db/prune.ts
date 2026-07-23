import "dotenv/config";
import { pool } from "./pool.js";
import { pruneExpiredAccounts } from "../services/pruner.js";

pruneExpiredAccounts()
  .then((n) => {
    console.log(`Pruned ${n} expired account(s).`);
    return pool.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
