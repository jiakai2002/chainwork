/**
 * indexer_query.js
 * Example: query Aptos indexer GraphQL to fetch ChainWork jobs.
 * In App.jsx, replace the placeholder loadJobs() with this.
 *
 * The Aptos Indexer exposes a GraphQL API that indexes all on-chain events.
 * We listen for JobCreated events emitted by job_escrow.move.
 */

const MODULE_ADDR = process.env.VITE_MODULE_ADDR || "0xCAFE";
const NETWORK     = process.env.VITE_APTOS_NETWORK || "testnet";

const INDEXER_URL = NETWORK === "mainnet"
  ? "https://api.mainnet.aptoslabs.com/v1/graphql"
  : "https://api.testnet.aptoslabs.com/v1/graphql";

const JOB_EVENTS_QUERY = `
  query GetJobEvents($moduleAddr: String!) {
    events(
      where: {
        account_address: { _eq: $moduleAddr }
        type: { _like: "%job_escrow%" }
      }
      order_by: { transaction_version: desc }
      limit: 100
    ) {
      type
      data
      transaction_version
    }
  }
`;

export async function fetchJobsFromIndexer() {
  const res = await fetch(INDEXER_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      query:     JOB_EVENTS_QUERY,
      variables: { moduleAddr: MODULE_ADDR },
    }),
  });
  const { data } = await res.json();
  const events = data?.events || [];

  // Reconstruct job list from events
  // Each event.data contains the emitted fields from the Move struct
  const jobMap = {};
  for (const e of events) {
    const d = e.data;
    if (e.type.includes("JobCreated")) {
      jobMap[d.job_id] = {
        id:          d.job_id,
        client:      d.client,
        freelancer:  d.freelancer,
        title:       d.title,
        description: d.description,
        milestones:  [],
      };
    }
  }

  return Object.values(jobMap);
}

/**
 * Alternative: read directly from account resources (simpler for MVP).
 * Each client's Job is stored as a resource at their address.
 */
export async function fetchJobFromAccount(aptosClient, clientAddr) {
  try {
    const resource = await aptosClient.getAccountResource({
      accountAddress: clientAddr,
      resourceType:   `${MODULE_ADDR}::job_escrow::Job`,
    });
    return resource.data;
  } catch {
    return null;
  }
}
