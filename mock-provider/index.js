import express from "express";

// Simulates a healthcare provider directory API — another independent
// upstream with its own naming convention (snake_case, network_tier enum).
const app = express();
const PORT = process.env.PORT ?? 4002;

app.get("/providers/:providerId/verify", (req, res) => {
  const outOfNetwork = req.params.providerId.startsWith("oon");
  res.json({
    provider_id: req.params.providerId,
    verified: true,
    network_tier: outOfNetwork ? "out_of_network" : "in_network",
  });
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`mock-provider listening on :${PORT}`));
