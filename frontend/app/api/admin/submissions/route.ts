import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

// force-dynamic prevents Next.js from attempting to statically generate this route.
// The admin API works in `npm run dev` only — with output:"export" it is excluded
// from the static build. See frontend/.env.local.example for required credentials.
export const dynamic = 'force-dynamic';

const TABLE_NAME = process.env.SUBMISSIONS_TABLE_NAME;

function getClient() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'ap-southeast-1',
    ...(process.env.AWS_ACCESS_KEY_ID && {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
  }));
}

function maskEmail(email: string): string {
  return email.replace(/(.{2}).+(@.+)/, '$1***$2');
}

export async function GET() {
  if (!TABLE_NAME) {
    return NextResponse.json(
      { error: 'SUBMISSIONS_TABLE_NAME is not configured. See .env.local.example.' },
      { status: 500 },
    );
  }

  try {
    const ddb = getClient();
    const result = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));

    const items = (result.Items ?? [])
      .map(item => ({
        submissionId: item.submissionId as string,
        email: maskEmail((item.email as string) ?? ''),
        timestamp: (item.timestamp as string) ?? '',
        status: (item.status as string) ?? '',
        dominantEmotion: item.dominantEmotion as string | undefined,
        emotionScores: item.emotionScores as Record<string, number> | undefined,
        emailSentAt: item.emailSentAt as string | undefined,
        templateUsed: item.templateUsed as string | undefined,
      }))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const byEmotion: Record<string, number> = {};
    let emailSentCount = 0;
    let emailFailedCount = 0;

    for (const item of items) {
      if (item.dominantEmotion) {
        byEmotion[item.dominantEmotion] = (byEmotion[item.dominantEmotion] ?? 0) + 1;
      }
      if (item.status === 'email_sent') emailSentCount++;
      if (item.status === 'email_failed') emailFailedCount++;
    }

    return NextResponse.json({
      submissions: items,
      analytics: {
        total: items.length,
        byEmotion,
        emailSentCount,
        emailFailedCount,
      },
    });
  } catch (err) {
    console.error('Admin submissions scan failed:', err);
    return NextResponse.json({ error: 'Failed to load submissions.' }, { status: 500 });
  }
}
