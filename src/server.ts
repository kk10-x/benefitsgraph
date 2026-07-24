import "dotenv/config";
import { createApp } from "./app.js";
import { startPruner } from "./services/pruner.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

startPruner();

app.listen(port, () => {
  console.log(`BenefitsGraph API listening on :${port}`);
});
