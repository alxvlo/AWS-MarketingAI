import { EventBridgeEvent } from 'aws-lambda';
import { RekognitionClient, DetectFacesCommand } from '@aws-sdk/client-rekognition';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const rekognition = new RekognitionClient({ region: process.env.REGION });
const s3 = new S3Client({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));

const TABLE_NAME = process.env.TABLE_NAME!;

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface S3ObjectCreatedDetail {
  bucket: { name: string };
  object: { key: string };
}

// s3Key format: uploads/{submissionId}
const submissionIdFromKey = (key: string) => key.split('/')[1];

export const handler = async (
  event: EventBridgeEvent<'Object Created', S3ObjectCreatedDetail>,
): Promise<void> => {
  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));
  const submissionId = submissionIdFromKey(key);

  if (!submissionId) {
    console.warn('Could not derive submissionId from key:', key);
    return;
  }

  // Server-side validation: check file size and content type from S3 object metadata
  // The presigned PUT URL cannot enforce these constraints, so we validate post-upload
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  const contentType = head.ContentType ?? '';
  const contentLength = head.ContentLength ?? 0;

  if (!ALLOWED_CONTENT_TYPES.includes(contentType) || contentLength > MAX_SIZE_BYTES) {
    console.warn('Invalid file rejected:', { contentType, contentLength, submissionId });
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await writeResult(submissionId, 'invalid_file', {});
    return;
  }

  const result = await rekognition.send(new DetectFacesCommand({
    Image: { S3Object: { Bucket: bucket, Name: key } },
    Attributes: ['ALL'],
  }));

  const face = result.FaceDetails?.[0];
  if (!face?.Emotions?.length) {
    await writeResult(submissionId, 'no_face_detected', {});
    return;
  }

  const sorted = [...face.Emotions].sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0));
  const dominant = (sorted[0].Type as string).toLowerCase();
  const emotionScores = Object.fromEntries(
    sorted.map(e => [(e.Type as string).toLowerCase(), Number((e.Confidence ?? 0).toFixed(2))]),
  );

  await writeResult(submissionId, dominant, emotionScores);
};

async function writeResult(submissionId: string, dominantEmotion: string, emotionScores: Record<string, number>) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { submissionId },
    UpdateExpression: 'SET dominantEmotion = :e, emotionScores = :s, #st = :status',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: {
      ':e': dominantEmotion,
      ':s': emotionScores,
      ':status': 'emotion_detected',
    },
  }));
}
