import { DynamoDBStreamEvent } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';

const ses = new SESClient({ region: process.env.REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));

const TABLE_NAME = process.env.TABLE_NAME!;
const CAMPAIGNS_TABLE_NAME = process.env.CAMPAIGNS_TABLE_NAME!;
const SENDER_EMAIL = process.env.SENDER_EMAIL!;
const FREQ_CAP_TABLE_NAME = process.env.FREQ_CAP_TABLE_NAME!;
const FREQ_CAP_SECONDS = 24 * 60 * 60;

type EmotionTemplate = { subject: string; body: string };

const TEMPLATES: Record<string, EmotionTemplate> = {
  happy_v1: {
    subject: 'You seem happy! Share your experience 😊',
    body: `Hi there,\n\nWe noticed you're in a great mood! We'd love it if you could take a moment to leave us a review.\n\nThank you for being an amazing customer!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  sad_v1: {
    subject: 'We want to make it up to you 💙',
    body: `Hi there,\n\nWe're sorry you're having a tough time. Please accept this exclusive 20% discount on your next purchase.\n\nUse code: CHEER20\n\nWe hope to brighten your day!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  surprised_v1: {
    subject: '⚡ Flash Deal — Just for You!',
    body: `Hi there,\n\nSurprise! We have an exclusive flash deal available right now — limited time only.\n\nCheck it out before it's gone!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  angry_v1: {
    subject: 'We sincerely apologise 🙏',
    body: `Hi there,\n\nWe can see something may have gone wrong and we truly apologise. Please accept a 30% discount as our way of saying sorry.\n\nUse code: SORRY30\n\nOur customer support team is ready to help: support@satisfactionmeter.com\n\nBest regards,\nSatisfaction Meter Team`,
  },
  neutral_v1: {
    subject: 'A special offer just for you',
    body: `Hi there,\n\nWe have a general offer we think you'll love. Check out our latest deals tailored just for you!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  disgusted_v1: {
    subject: 'We want to hear from you',
    body: `Hi there,\n\nWe noticed something might be off and we'd really like to hear your feedback. Your opinion helps us improve.\n\nPlease reach out to us at support@satisfactionmeter.com\n\nBest regards,\nSatisfaction Meter Team`,
  },
  fearful_v1: {
    subject: "We're here to help",
    body: `Hi there,\n\nWe want you to know that we're here for you. If you have any concerns or need assistance, please don't hesitate to reach out.\n\nBest regards,\nSatisfaction Meter Team`,
  },
  calm_v1: {
    subject: 'Exclusive member offer for you',
    body: `Hi there,\n\nEnjoy this exclusive member offer we've curated just for you. We appreciate your loyalty!\n\nBest regards,\nSatisfaction Meter Team`,
  },
  happy_v2: {
    subject: 'Your smile made our day! 😄',
    body: `Hi there,\n\nYour positive energy is contagious! We'd love to feature your story. Reply to this email if you'd like to be highlighted as a customer of the month.\n\nThank you,\nSatisfaction Meter Team`,
  },
  sad_v2: {
    subject: 'A little something to brighten your day 🌟',
    body: `Hi there,\n\nHard days happen to everyone. Here's a 15% discount — no strings attached — to treat yourself.\n\nUse code: LIFT15\n\nTake care,\nSatisfaction Meter Team`,
  },
  surprised_v2: {
    subject: 'Something unexpected is waiting for you!',
    body: `Hi there,\n\nYou look like someone who loves a good surprise. We've unlocked an early-access deal just for you.\n\nLog in to see what's waiting!\n\nBest,\nSatisfaction Meter Team`,
  },
  angry_v2: {
    subject: "Let's make this right 🤝",
    body: `Hi there,\n\nWe heard you and we want to do better. A dedicated support agent is standing by — just reply to this email and we'll resolve things personally.\n\nWe also want to offer you 25% off your next purchase.\n\nUse code: RESOLVE25\n\nBest regards,\nSatisfaction Meter Team`,
  },
  neutral_v2: {
    subject: 'New arrivals picked for you',
    body: `Hi there,\n\nBased on your interests, we've put together a personalised selection of new arrivals. Take a look — something might catch your eye!\n\nBest,\nSatisfaction Meter Team`,
  },
  disgusted_v2: {
    subject: 'Your feedback matters to us',
    body: `Hi there,\n\nWe noticed something might not be right. We'd love a chance to understand your experience better — your honest feedback shapes how we improve.\n\nReply or reach us at support@satisfactionmeter.com\n\nThank you,\nSatisfaction Meter Team`,
  },
  fearful_v2: {
    subject: "You're in good hands 🤗",
    body: `Hi there,\n\nWhatever's on your mind, our team is ready to listen and help. Reach out any time — no issue is too small.\n\nWe're here,\nSatisfaction Meter Team`,
  },
  calm_v2: {
    subject: 'A reward for your loyalty',
    body: `Hi there,\n\nYour continued support means everything to us. Enjoy an exclusive loyalty reward as a token of our appreciation.\n\nBest,\nSatisfaction Meter Team`,
  },
};

const DEFAULT_TEMPLATE: EmotionTemplate = TEMPLATES['neutral_v1'];

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    if (record.eventName !== 'MODIFY' && record.eventName !== 'INSERT') continue;
    if (!record.dynamodb?.NewImage) continue;

    const item = unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>);

    if (!item.dominantEmotion || item.emailSentAt) continue;

    const { submissionId, email, dominantEmotion } = item;
    if (!email || !submissionId) continue;

    const capCheck = await ddb.send(new GetCommand({
      TableName: FREQ_CAP_TABLE_NAME,
      Key: { email },
    }));
    if (capCheck.Item) {
      console.log(`Suppressed duplicate email to ${email} — within 24h cap window.`);
      continue;
    }

    const variant = Math.random() < 0.5 ? 'v1' : 'v2';
    const templateKey = `${dominantEmotion}_${variant}`;
    const template = TEMPLATES[templateKey] ?? DEFAULT_TEMPLATE;

    try {
      await ses.send(new SendEmailCommand({
        Source: SENDER_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: template.subject },
          Body: { Text: { Data: template.body } },
        },
      }));

      const sentAt = new Date().toISOString();

      await Promise.all([
        ddb.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { submissionId },
          UpdateExpression: 'SET emailSentAt = :t, templateUsed = :tmpl, #st = :done',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: {
            ':t': sentAt,
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
        ddb.send(new PutCommand({
          TableName: FREQ_CAP_TABLE_NAME,
          Item: {
            email,
            sentAt,
            ttl: Math.floor(Date.now() / 1000) + FREQ_CAP_SECONDS,
          },
        })),
      ]);
    } catch (err) {
      console.error(`Failed to send email for submission ${submissionId}:`, err);
      throw err;
    }
  }
};
