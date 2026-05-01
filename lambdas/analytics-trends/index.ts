import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, paginateScan } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));
const SUBMISSIONS_TABLE_NAME = process.env.SUBMISSIONS_TABLE_NAME!;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type DayBucket = { date: string; counts: Record<string, number> };

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

    const buckets = new Map<string, Record<string, number>>();

    const paginator = paginateScan(
      { client: ddb },
      {
        TableName: SUBMISSIONS_TABLE_NAME,
        ProjectionExpression: '#ts, dominantEmotion',
        FilterExpression: '#ts >= :cutoff',
        ExpressionAttributeNames: { '#ts': 'timestamp' },
        ExpressionAttributeValues: { ':cutoff': cutoff },
      },
    );

    for await (const page of paginator) {
      for (const item of page.Items ?? []) {
        const ts = item.timestamp as string | undefined;
        const emotion = item.dominantEmotion as string | undefined;
        if (!ts || !emotion) continue;

        const date = ts.slice(0, 10);
        const bucket = buckets.get(date) ?? {};
        bucket[emotion] = (bucket[emotion] ?? 0) + 1;
        buckets.set(date, bucket);
      }
    }

    const trends: DayBucket[] = Array.from(buckets.entries())
      .map(([date, counts]) => ({ date, counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return respond(200, trends);
  } catch (err) {
    console.error('analytics-trends failed:', err);
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
