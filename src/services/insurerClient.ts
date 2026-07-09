const BASE_URL = process.env.INSURER_SERVICE_URL ?? "http://localhost:4001";

export type InsurerPolicyRecord = {
  policyRef: string;
  status: "active" | "lapsed";
};

/**
 * Client for the mock insurer service — represents an external data source
 * with its own schema/latency characteristics, separate from our own DB.
 * Used to cross-check a policy is still active with the underlying insurer
 * before adjudicating against our locally cached rules.
 */
export async function fetchPolicyStatus(policyRef: string): Promise<InsurerPolicyRecord> {
  const res = await fetch(`${BASE_URL}/policy-status/${encodeURIComponent(policyRef)}`);
  if (!res.ok) {
    throw new Error(`Insurer service returned ${res.status} for policy ${policyRef}`);
  }
  return (await res.json()) as InsurerPolicyRecord;
}
