import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));
const TABLE_NAME = process.env.TABLE_NAME!;

/**
 * POST /confirm/{submissionId}
 *
 * Marks an already-analysed submission as "confirmed" so the send-email
 * Lambda (which gates on `confirmed === true`) dispatches the templated
 * email. Two-phase flow:
 *   1. User snaps/uploads → S3 event → inference Lambda writes
 *      dominantEmotion + emotionScores, status = "emotion_detected".
 *   2. UI shows Rekognition's verdict, user clicks "Send for Analysis"
 *      → this endpoint sets confirmed = true → DynamoDB stream fires
 *      send-email Lambda → SES dispatches.
 *
 * Idempotent: re-confirming an already-confirmed record is a no-op.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const submissionId = event.pathParameters?.submissionId ?? '';
  if (!submissionId) return respond(400, { message: 'submissionId is required.' });

  let email: string | undefined;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    email = typeof body.email === 'string' ? body.email.trim() : undefined;
  } catch {
    return respond(400, { message: 'Invalid JSON body.' });
  }

  // Email is required at confirm time (it's the SES destination address).
  // If it wasn't set on upload, the user must provide it here.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(400, { message: 'A valid email address is required to confirm.' });
  }

  log('INFO', 'confirm-result', 'confirm_requested', submissionId);

  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { submissionId },
      // Only confirm submissions where Rekognition has already produced a
      // dominantEmotion. Prevents premature confirms (race against inference).
      ConditionExpression: 'attribute_exists(dominantEmotion) AND (attribute_not_exists(confirmed) OR confirmed = :false)',
      UpdateExpression: 'SET confirmed = :true, email = :email',
      ExpressionAttributeValues: { ':true': true, ':false': false, ':email': email },
      ReturnValues: 'ALL_NEW',
    }));
    log('INFO', 'confirm-result', 'confirmed', submissionId);
    return respond(200, { submissionId, confirmed: true, status: res.Attributes?.status });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      log('INFO', 'confirm-result', 'confirm_skipped', submissionId, { reason: 'not_ready_or_already_confirmed' });
      return respond(409, { message: 'Submission is not ready to confirm or already confirmed.' });
    }
    log('ERROR', 'confirm-result', 'confirm_error', submissionId, { error: (err as Error).message });
    return respond(500, { message: 'Failed to confirm submission.' });
  }
};

function respond(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}
