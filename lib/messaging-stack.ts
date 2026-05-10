import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
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

    // DynamoDB table: email suppression list — keyed on email address, no TTL (permanent)
    const suppressionTable = new dynamodb.Table(this, 'EmailSuppressionTable', {
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // SNS topic: SES publishes bounce and complaint notifications here.
    // After deploy, configure this ARN in the SES console under
    // satisfactionmeter.live → Notifications → Bounces and Complaints.
    const sesNotificationsTopic = new sns.Topic(this, 'SesNotificationsTopic');

    // DLQ for failed bounce-handler invocations
    const bounceHandlerDlq = new sqs.Queue(this, 'BounceHandlerDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    // Lambda: processes SES bounce/complaint notifications from SNS → writes to suppression table
    const bounceHandlerFn = new NodejsFunction(this, 'BounceHandlerFunction', {
      entry: path.join(__dirname, '../lambdas/bounce-handler/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      deadLetterQueue: bounceHandlerDlq,
      environment: {
        SUPPRESSION_TABLE_NAME: suppressionTable.tableName,
        REGION: this.region,
      },
    });

    suppressionTable.grantWriteData(bounceHandlerFn);
    bounceHandlerFn.addEventSource(new lambdaEventSources.SnsEventSource(sesNotificationsTopic));

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
        SUPPRESSION_TABLE_NAME: suppressionTable.tableName,
        SENDER_EMAIL: senderEmail,
        REGION: this.region,
      },
    });

    submissionsTable.grantReadWriteData(sendEmailFn);
    campaignsTable.grantWriteData(sendEmailFn);
    suppressionTable.grantReadData(sendEmailFn);

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

    new cdk.CfnOutput(this, 'SesNotificationsTopicArn', {
      value: sesNotificationsTopic.topicArn,
      description: 'Configure this ARN in SES console: satisfactionmeter.live → Notifications → Bounces and Complaints',
    });
  }
}
