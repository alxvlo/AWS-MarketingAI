import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { createHash } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SUBMISSIONS_TABLE_NAME!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const displayId = (submissionId: string) =>
  createHash("sha256").update(submissionId).digest("hex").slice(0, 12);

interface ProjectedSubmission {
  submissionId?: string;
  timestamp?: string;
  status?: string;
  dominantEmotion?: string;
  emailSentAt?: string;
}

let cache: { expiresAt: number; items: ProjectedSubmission[] } | undefined;

async function loadSafeItems(): Promise<ProjectedSubmission[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.items;

  const items: ProjectedSubmission[] = [];
  let exclusiveStartKey: ScanCommandInput["ExclusiveStartKey"];
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey: exclusiveStartKey,
      ProjectionExpression: "submissionId, #ts, #st, dominantEmotion, emailSentAt",
      ExpressionAttributeNames: { "#ts": "timestamp", "#st": "status" },
    }));
    items.push(...((result.Items ?? []) as ProjectedSubmission[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  cache = { expiresAt: Date.now() + 60_000, items };
  return items;
}

export const handler: APIGatewayProxyHandler = async () => {
  // Project only fields safe for anonymous viewing. The one-way display ID
  // cannot be used with the result or confirm endpoints.
  const allItems = await loadSafeItems();
  const items = allItems
    .map(i => ({
      displayId:       displayId(i.submissionId ?? ""),
      timestamp:       i.timestamp ?? "",
      status:          i.status ?? "",
      dominantEmotion: i.dominantEmotion,
      emailSentAt:     i.emailSentAt,
    }))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  const byEmotion: Record<string, number> = {};
  let emailSentCount = 0, emailFailedCount = 0;
  for (const it of items) {
    if (it.dominantEmotion) byEmotion[it.dominantEmotion] = (byEmotion[it.dominantEmotion] ?? 0) + 1;
    if (it.status === "email_sent")   emailSentCount++;
    if (it.status === "email_failed") emailFailedCount++;
  }

  return {
    statusCode: 200,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissions: items.slice(0, 100),
      analytics: { total: items.length, byEmotion, emailSentCount, emailFailedCount },
    }),
  };
};
