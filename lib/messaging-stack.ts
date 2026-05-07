import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface MessagingStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
  campaignsTable: dynamodb.Table;
  senderEmail: string;
}

export class MessagingStack extends cdk.Stack {
  public readonly messagingDlq: sqs.Queue;
  public readonly sendEmailFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    const { submissionsTable, campaignsTable, senderEmail } = props;

    // DLQ for failed email send events — catches both Lambda crashes and exhausted stream retries
    this.messagingDlq = new sqs.Queue(this, 'MessagingDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda: reads emotion from DynamoDB stream → sends SES email → writes back emailSentAt
    const sendEmailFn = new NodejsFunction(this, 'SendEmailFunction', {
      entry: path.join(__dirname, '../lambdas/send-email/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      deadLetterQueue: this.messagingDlq,
      environment: {
        TABLE_NAME: submissionsTable.tableName,
        CAMPAIGNS_TABLE_NAME: campaignsTable.tableName,
        SENDER_EMAIL: senderEmail,
        REGION: this.region,
      },
    });

    submissionsTable.grantReadWriteData(sendEmailFn);
    campaignsTable.grantWriteData(sendEmailFn);

    sendEmailFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    // DynamoDB stream triggers email send when inference writes emotion result
    sendEmailFn.addEventSource(
      new lambdaEventSources.DynamoEventSource(submissionsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        bisectBatchOnError: true,
        retryAttempts: 2,
        onFailure: new lambdaEventSources.SqsDlq(this.messagingDlq),
      }),
    );

    this.sendEmailFunction = sendEmailFn;
  }
}
