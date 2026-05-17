/**
 * One-shot backfill: strip _v1 / _v2 suffix from templateUsed in both
 * the Submissions (Results) table and the Campaigns analytics table.
 *
 * Run with:  npx tsx scripts/backfill-template-names.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const REGION = 'ap-southeast-1';
const SUBMISSIONS_TABLE = 'SatisfactionMeterCapture-SubmissionsTable75718D3D-18CWN8BHAXL8D';
const CAMPAIGNS_TABLE = 'SatisfactionMeterAnalytics-CampaignsTableC0F6C4C0-1DKGAR1U9RHFB';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function strip(t: string | undefined): string | null {
  if (!t) return null;
  const m = t.match(/^(.+)_v\d+$/);
  return m ? m[1] : null;
}

async function backfillTable(table: string, keyAttr: string) {
  console.log(`\n=== Scanning ${table} (key: ${keyAttr}) ===`);
  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let updated = 0;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: table,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: '#k, templateUsed',
      ExpressionAttributeNames: { '#k': keyAttr },
    }));
    for (const item of res.Items ?? []) {
      scanned++;
      const newVal = strip(item.templateUsed as string | undefined);
      if (!newVal) continue;
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { [keyAttr]: item[keyAttr] },
        UpdateExpression: 'SET templateUsed = :v',
        ExpressionAttributeValues: { ':v': newVal },
      }));
      updated++;
      console.log(`  ${item[keyAttr]}: ${item.templateUsed} -> ${newVal}`);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  console.log(`Scanned ${scanned}, updated ${updated}.`);
}

(async () => {
  await backfillTable(SUBMISSIONS_TABLE, 'submissionId');
  await backfillTable(CAMPAIGNS_TABLE, 'submissionId');
  console.log('\nDone.');
})().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
