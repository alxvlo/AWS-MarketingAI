import { SNSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { log } from '../shared/logger';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION }));

const SUPPRESSION_TABLE_NAME = process.env.SUPPRESSION_TABLE_NAME!;

// Transient bounces (e.g. mailbox full) are temporary — do not suppress permanently
const SUPPRESS_BOUNCE_TYPES = new Set(['Permanent']);

interface SesBouncedRecipient {
  emailAddress: string;
}

interface SesComplainedRecipient {
  emailAddress: string;
}

interface SesBounceNotification {
  notificationType: 'Bounce';
  bounce: {
    bounceType: string;
    bouncedRecipients: SesBouncedRecipient[];
    timestamp: string;
  };
}

interface SesComplaintNotification {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: SesComplainedRecipient[];
    complaintFeedbackType?: string;
    timestamp: string;
  };
}

type SesNotification = SesBounceNotification | SesComplaintNotification | { notificationType: string };

export const handler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    let notification: SesNotification;
    try {
      notification = JSON.parse(record.Sns.Message) as SesNotification;
    } catch {
      log('ERROR', 'bounce-handler', 'parse_error', '', { messageId: record.Sns.MessageId });
      continue;
    }

    if (notification.notificationType === 'Bounce') {
      const n = notification as SesBounceNotification;
      const { bounceType, bouncedRecipients, timestamp } = n.bounce;

      if (!SUPPRESS_BOUNCE_TYPES.has(bounceType)) {
        log('INFO', 'bounce-handler', 'bounce_transient_skipped', '', { bounceType });
        continue;
      }

      for (const recipient of bouncedRecipients) {
        log('INFO', 'bounce-handler', 'bounce_received', '', { bounceType });
        await suppressEmail(recipient.emailAddress, 'bounce', bounceType, timestamp);
      }
    } else if (notification.notificationType === 'Complaint') {
      const n = notification as SesComplaintNotification;
      const { complainedRecipients, complaintFeedbackType, timestamp } = n.complaint;

      for (const recipient of complainedRecipients) {
        log('INFO', 'bounce-handler', 'complaint_received', '', { complaintFeedbackType: complaintFeedbackType ?? 'unknown' });
        await suppressEmail(recipient.emailAddress, 'complaint', complaintFeedbackType ?? 'unknown', timestamp);
      }
    }
  }
};

async function suppressEmail(
  email: string,
  reason: 'bounce' | 'complaint',
  detail: string,
  sesTimestamp: string,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: SUPPRESSION_TABLE_NAME,
    Item: {
      email,
      reason,
      detail,
      sesTimestamp,
      suppressedAt: new Date().toISOString(),
    },
  }));
  log('INFO', 'bounce-handler', 'email_suppressed', '', { reason, detail });
}
