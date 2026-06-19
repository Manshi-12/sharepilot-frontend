import { CosmosClient, Container } from "@azure/cosmos";

// Lazily create the Cosmos client/containers on first actual use, instead of
// at module-import time. Next.js briefly imports every API route during
// `next build` to collect page data — if this file threw at import time
// (as it used to), the build failed in CI environments (e.g. GitHub Actions)
// that don't have COSMOS_ENDPOINT / COSMOS_KEY set as build-time env vars,
// even though those values are only ever needed at actual request time.
let _client: CosmosClient | null = null;

function getClient(): CosmosClient {
  if (!_client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be set in environment variables.");
    }
    _client = new CosmosClient({ endpoint, key });
  }
  return _client;
}

function getDatabase() {
  const databaseId = process.env.COSMOS_DATABASE || "sharepilot";
  return getClient().database(databaseId);
}

function lazyContainer(name: string): Container {
  return new Proxy({} as Container, {
    get(_target, prop, receiver) {
      const container = getDatabase().container(name);
      const value = Reflect.get(container, prop, container);
      return typeof value === "function" ? value.bind(container) : value;
    },
  });
}

export const usersContainer = lazyContainer("users");
export const sessionsContainer = lazyContainer("sessions");
export const messagesContainer = lazyContainer("messages");
export const refreshTokensContainer = lazyContainer("refreshTokens");

export default {
  database: (id?: string) => getClient().database(id || process.env.COSMOS_DATABASE || "sharepilot"),
};