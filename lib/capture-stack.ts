import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class CaptureStack extends cdk.Stack {
  public readonly imageBucket: s3.Bucket;
  public readonly submissionsTable: dynamodb.Table;
  public readonly presignedUrlFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket: SSE-S3 encryption, 30-day raw image expiry
    // eventBridgeEnabled: lets InferenceStack react to uploads without a cross-stack circular reference
    this.imageBucket = new s3.Bucket(this, 'ImageBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          id: 'expire-raw-images',
          expiration: cdk.Duration.days(30),
          enabled: true,
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB table for submissions — submissionId (pk), TTL = 30 days
    // stream enabled so MessagingStack can react to newly written emotion results
    this.submissionsTable = new dynamodb.Table(this, 'SubmissionsTable', {
      partitionKey: { name: 'submissionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda: generate presigned PUT URL
    const presignedUrlFn = new NodejsFunction(this, 'PresignedUrlFunction', {
      entry: path.join(__dirname, '../lambdas/presigned-url/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        BUCKET_NAME: this.imageBucket.bucketName,
        TABLE_NAME: this.submissionsTable.tableName,
        REGION: this.region,
      },
    });

    this.presignedUrlFunction = presignedUrlFn;
    this.imageBucket.grantPut(presignedUrlFn);
    this.submissionsTable.grantWriteData(presignedUrlFn);

    // API Gateway: POST /upload → presigned URL
    const api = new apigateway.RestApi(this, 'CaptureApi', {
      restApiName: 'satisfaction-meter-capture',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
      },
    });

    const uploadResource = api.root.addResource('upload');
    // No API key: this is a public browser-facing endpoint — embedding a key in client JS
    // would expose it to anyone. Rate limiting is handled by API Gateway's default stage throttle.
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(presignedUrlFn));

    new cdk.CfnOutput(this, 'UploadApiUrl', {
      value: `${api.url}upload`,
      description: 'POST endpoint to request a presigned S3 upload URL',
    });

    new cdk.CfnOutput(this, 'ImageBucketName', {
      value: this.imageBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'SubmissionsTableName', {
      value: this.submissionsTable.tableName,
    });
  }
}
