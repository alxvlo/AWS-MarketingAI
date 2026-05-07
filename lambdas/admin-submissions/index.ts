import { APIGatewayProxyHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.SUBMISSIONS_TABLE_NAME!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

const maskEmail = (e: string) => e.replace(/(.{2}).+(@.+)/, "$1***$2");

export const handler: APIGatewayProxyHandler = async () => {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const items = (result.Items ?? [])
    .map(i => ({
      submissionId:    i.submissionId,
      email:           maskEmail(i.email ?? ""),
      timestamp:       i.timestamp ?? "",
      status:          i.status ?? "",
      dominantEmotion: i.dominantEmotion,
      emotionScores:   i.emotionScores,
      emailSentAt:     i.emailSentAt,
      templateUsed:    i.templateUsed,
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
      submissions: items,
      analytics: { total: items.length, byEmotion, emailSentCount, emailFailedCount },
    }),
  };
};
