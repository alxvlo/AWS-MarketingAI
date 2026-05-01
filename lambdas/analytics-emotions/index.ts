import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, paginateScan } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));
const SUBMISSIONS_TABLE_NAME = process.env.SUBMISSIONS_TABLE_NAME!;

const CACHE_TTL_MS = 60_000;
type CacheEntry = { data: { total: number; counts: Record<string, number> }; expiresAt: number };
let cache: CacheEntry | null = null;

export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      console.log('cache hit');
      return respond(200, cache.data);
    }

    const counts: Record<string, number> = {};
    let total = 0;

    const paginator = paginateScan(
      { client: ddb },
      {
        TableName: SUBMISSIONS_TABLE_NAME,
        ProjectionExpression: 'dominantEmotion',
      },
    );

    for await (const page of paginator) {
      for (const item of page.Items ?? []) {
        const emotion = item.dominantEmotion as string | undefined;
        if (!emotion) continue;
        counts[emotion] = (counts[emotion] ?? 0) + 1;
        total += 1;
      }
    }

    const data = { total, counts };
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };

    return respond(200, data);
  } catch (err) {
    console.error('analytics-emotions failed:', err);
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
