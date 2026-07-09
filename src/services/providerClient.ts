const BASE_URL = process.env.PROVIDER_SERVICE_URL ?? "http://localhost:4002";

export type ProviderVerification = {
  provider_id: string;
  verified: boolean;
  network_tier: "in_network" | "out_of_network";
};

/**
 * Client for the mock healthcare provider service — a second independent
 * data source (different field naming convention on purpose) used to verify
 * the claiming provider before adjudication.
 */
export async function verifyProvider(providerRef: string): Promise<ProviderVerification> {
  const res = await fetch(`${BASE_URL}/providers/${encodeURIComponent(providerRef)}/verify`);
  if (!res.ok) {
    throw new Error(`Provider service returned ${res.status} for provider ${providerRef}`);
  }
  return (await res.json()) as ProviderVerification;
}
