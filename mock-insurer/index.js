import express from "express";

// Simulates an insurer's policy-status API: deliberately uses snake_case and
// a different response shape than our internal DB model, to stand in for a
// real third-party integration.
const app = express();
const PORT = process.env.PORT ?? 4001;

app.get("/policy-status/:policyRef", (req, res) => {
  const lapsed = req.params.policyRef.endsWith("0");
  res.json({
    policyRef: req.params.policyRef,
    status: lapsed ? "lapsed" : "active",
  });
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`mock-insurer listening on :${PORT}`));
