import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface InferenceStackProps extends cdk.StackProps {
  imageBucket: s3.Bucket;
  submissionsTable: dynamodb.Table;
}

export class InferenceStack extends cdk.Stack {
  public readonly inferenceDlq: sqs.Queue;
  public readonly inferenceFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: InferenceStackProps) {
    super(scope, id, props);

    const { imageBucket, submissionsTable } = props;

    // DLQ for failed inference events
    this.inferenceDlq = new sqs.Queue(this, 'InferenceDlq', {
      retentionPeriod: cdk.Duration.days(14),
    });

    const inferenceLogGroup = new logs.LogGroup(this, 'InferenceLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda: triggered by S3 PUT → Rekognition → writes emotion to DynamoDB
    const inferenceFn = new NodejsFunction(this, 'InferenceFunction', {
      entry: path.join(__dirname, '../lambdas/inference/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      deadLetterQueue: this.inferenceDlq,
      logGroup: inferenceLogGroup,
      environment: {
        TABLE_NAME: submissionsTable.tableName,
        REGION: this.region,
      },
    });

    imageBucket.grantRead(inferenceFn);
    // DeleteObject needed to remove invalid files (wrong type or oversized) post-upload
    imageBucket.grantDelete(inferenceFn);
    submissionsTable.grantWriteData(inferenceFn);

    inferenceFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:DetectFaces'],
      resources: ['*'],
    }));

    // EventBridge rule: S3 Object Created → inference Lambda
    // Using EventBridge (not s3.addEventNotification) avoids a circular cross-stack CDK dependency
    new events.Rule(this, 'S3UploadRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [imageBucket.bucketName] },
          object: { key: [{ prefix: 'uploads/' }] },
        },
      },
      targets: [new targets.LambdaFunction(inferenceFn)],
    });

    this.inferenceFunction = inferenceFn;
  }
}
