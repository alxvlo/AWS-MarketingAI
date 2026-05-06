import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const submissionId = event.pathParameters?.submissionId ?? '';

  if (!submissionId) {
    return respond(400, { message: 'submissionId is required.' });
  }

  log('INFO', 'get-result', 'result_requested', submissionId);

  const result = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { submissionId },
  }));

  if (!result.Item) {
    log('WARN', 'get-result', 'result_not_found', submissionId);
    return respond(404, { message: 'Submission not found.' });
  }

  log('INFO', 'get-result', 'result_found', submissionId, { status: result.Item.status });

  // strip internal fields before returning
  const { ttl, s3Key, ...publicFields } = result.Item;

  return respond(200, publicFields);
};

function respond(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
