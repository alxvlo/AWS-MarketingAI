import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, paginateScan } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));
const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const perTemplate: Record<string, number> = {};
    let totalSent = 0;
    let earliestSentAt: string | null = null;
    let latestSentAt: string | null = null;

    const paginator = paginateScan(
      { client: ddb },
      {
        TableName: CAMPAIGNS_TABLE_NAME,
        ProjectionExpression: 'templateUsed, emailSentAt',
      },
    );

    for await (const page of paginator) {
      for (const item of page.Items ?? []) {
        const template = item.templateUsed as string | undefined;
        const sentAt = item.emailSentAt as string | undefined;
        if (!template || !sentAt) continue;

        perTemplate[template] = (perTemplate[template] ?? 0) + 1;
        totalSent += 1;

        if (!earliestSentAt || sentAt < earliestSentAt) earliestSentAt = sentAt;
        if (!latestSentAt || sentAt > latestSentAt) latestSentAt = sentAt;
      }
    }

    return respond(200, { totalSent, perTemplate, earliestSentAt, latestSentAt });
  } catch (err) {
    console.error('analytics-campaigns failed:', err);
    return respond(500, { message: 'internal error' });
  }
};

function respond(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
