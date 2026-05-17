import { DynamoDBStreamEvent } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { log } from '../shared/logger';

const ses = new SESClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));

const TABLE_NAME = process.env.TABLE_NAME!;
const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;
const SUPPRESSION_TABLE_NAME = process.env.SUPPRESSION_TABLE_NAME!;
const SENDER_EMAIL = process.env.SENDER_EMAIL!;

const SKIP_EMOTIONS = new Set(['no_face_detected', 'invalid_file']);

type EmotionTemplate = { subject: string; body: string };

const TEMPLATES: Record<string, EmotionTemplate> = {
  happy: {
    subject: 'You seem happy! Share your experience 😊',
    body: `Hi there,\n\nWe noticed you're in a great mood! We'd love it if you could take a moment to leave us a review.\n\nThank you for being an amazing customer!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  sad: {
    subject: 'We want to make it up to you 💙',
    body: `Hi there,\n\nWe're sorry you're having a tough time. Please accept this exclusive 20% discount on your next purchase.\n\nUse code: CHEER20\n\nWe hope to brighten your day!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  surprised: {
    subject: '⚡ Flash Deal — Just for You!',
    body: `Hi there,\n\nSurprise! We have an exclusive flash deal available right now — limited time only.\n\nCheck it out before it's gone!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  angry: {
    subject: 'We sincerely apologise 🙏',
    body: `Hi there,\n\nWe can see something may have gone wrong and we truly apologise. Please accept a 30% discount as our way of saying sorry.\n\nUse code: SORRY30\n\nOur customer support team is ready to help: support@satisfactionmeter.com\n\nBest regards,\nSatisfaction Meter Team`,
  },
  neutral: {
    subject: 'A special offer just for you',
    body: `Hi there,\n\nWe have a general offer we think you'll love. Check out our latest deals tailored just for you!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  disgusted: {
    subject: 'We want to hear from you',
    body: `Hi there,\n\nWe noticed something might be off and we'd really like to hear your feedback. Your opinion helps us improve.\n\nPlease reach out to us at support@satisfactionmeter.com\n\nBest regards,\nSatisfaction Meter Team`,
  },
  fear: {
    subject: "We're here to help",
    body: `Hi there,\n\nWe want you to know that we're here for you. If you have any concerns or need assistance, please don't hesitate to reach out.\n\nBest regards,\nSatisfaction Meter Team`,
  },
  calm: {
    subject: 'Exclusive member offer for you',
    body: `Hi there,\n\nEnjoy this exclusive member offer we've curated just for you. We appreciate your loyalty!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  confused: {
    subject: 'Need a hand? We can help',
    body: `Hi there,\n\nLooks like things might be unclear. Reach out to our team at support@satisfactionmeter.com and we'll walk you through anything you need.\n\nBest regards,\nSatisfaction Meter Team`,
  },
};

const DEFAULT_TEMPLATE: EmotionTemplate = TEMPLATES['neutral'];

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    if (record.eventName !== 'MODIFY' && record.eventName !== 'INSERT') continue;
    if (!record.dynamodb?.NewImage) continue;

    const item = unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>);

    if (!item.dominantEmotion || item.emailSentAt) continue;
    // Email is only sent after the user explicitly confirms in the UI.
    // confirmed=true is written by the /confirm/{submissionId} endpoint.
    if (item.confirmed !== true) continue;

    const { submissionId, email, dominantEmotion } = item;
    if (!email || !submissionId) continue;

    if (SKIP_EMOTIONS.has(dominantEmotion)) {
      log('INFO', 'send-email', 'email_skipped_no_face', submissionId);
      continue;
    }

    const suppressed = await checkSuppression(email);
    if (suppressed) {
      log('INFO', 'send-email', 'email_suppressed', submissionId, { reason: suppressed.reason });
      continue;
    }

    const templateKey = dominantEmotion;
    const template = TEMPLATES[templateKey] ?? DEFAULT_TEMPLATE;

    try {
      // Step A — Claim emailSentAt atomically before touching SES
      log('INFO', 'send-email', 'email_claim_attempted', submissionId);
      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { submissionId },
          UpdateExpression: 'SET emailSentAt = :t',
          ConditionExpression: 'attribute_not_exists(emailSentAt)',
          ExpressionAttributeValues: { ':t': new Date().toISOString() },
        }));
      } catch (claimErr: any) {
        if (claimErr.name === 'ConditionalCheckFailedException') {
          log('INFO', 'send-email', 'email_already_claimed', submissionId);
          continue;
        }
        throw claimErr;
      }

      // Step B — Send email via SES
      await ses.send(new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: template.subject },
          Body: { Text: { Data: template.body } },
        },
      }));

      log('INFO', 'send-email', 'email_sent', submissionId, { templateUsed: templateKey });

      const sentAt = new Date().toISOString();

      // Step C — Enrich record; emailSentAt already written by claim
      await Promise.all([
        ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { submissionId },
          UpdateExpression: 'SET templateUsed = :tmpl, #st = :done',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':tmpl': templateKey,
            ':done': 'email_sent',
          },
        })),
        ddb.send(new PutCommand({
          TableName: CAMPAIGNS_TABLE_NAME,
          Item: {
            submissionId,
            email,
            emailSentAt: sentAt,
            templateUsed: templateKey,
            dominantEmotion,
          },
        })),
      ]);
    } catch (err) {
      log('ERROR', 'send-email', 'email_error', submissionId, { error: (err as Error).message, errorName: (err as Error).name });
      try {
        await ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { submissionId },
          UpdateExpression: 'SET #st = :failed',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':failed': 'email_failed' },
        }));
      } catch (writeErr) {
        log('ERROR', 'send-email', 'email_error', submissionId, { error: 'could_not_write_email_failed', errorName: (writeErr as Error).name });
      }
      throw err;
    }
  }
};

async function checkSuppression(email: string): Promise<{ reason: string } | null> {
  const result = await ddb.send(new GetCommand({
    TableName: SUPPRESSION_TABLE_NAME,
    Key: { email },
  }));
  return result.Item ? { reason: result.Item.reason as string } : null;
}
