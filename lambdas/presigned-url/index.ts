import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

const s3 = new S3Client({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));

const BUCKET_NAME = process.env.BUCKET_NAME!;
const TABLE_NAME = process.env.TABLE_NAME!;
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body ?? '{}');
    const { email, contentType } = body as { email?: string; contentType?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond(400, { message: 'Valid email is required.' });
    }
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return respond(400, { message: `contentType must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` });
    }

    const submissionId = randomUUID();
    const s3Key = `uploads/${submissionId}`;
    const ttl = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    // Note: presigned PUT URLs cannot enforce file size server-side (ContentLengthRange
    // only works with presigned POST). Size and content type are validated post-upload
    // in the inference Lambda via HeadObject before Rekognition is called.
    const presignedUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 300 },
    );

    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        submissionId,
        email,
        s3Key,
        status: 'pending',
        timestamp: new Date().toISOString(),
        ttl,
      },
    }));

    return respond(200, { submissionId, uploadUrl: presignedUrl });
  } catch (err) {
    console.error(err);
    return respond(500, { message: 'Internal server error.' });
  }
};

function respond(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}
