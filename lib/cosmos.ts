import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT!;
const key = process.env.COSMOS_KEY!;
const databaseId = process.env.COSMOS_DATABASE || "sharepilot";

if (!endpoint || !key) {
  throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be set in environment variables.");
}

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);

export const usersContainer = database.container("users");
export const sessionsContainer = database.container("sessions");
export const messagesContainer = database.container("messages");
export const refreshTokensContainer = database.container("refreshTokens");

export default client;