import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  imageBucket: s3.Bucket;
  submissionsTable: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { submissionsTable } = props;

    // Lambda: GET /results/{submissionId} → return stored record from DynamoDB
    const getResultFn = new NodejsFunction(this, 'GetResultFunction', {
      entry: path.join(__dirname, '../lambdas/get-result/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      environment: {
        TABLE_NAME: submissionsTable.tableName,
        REGION: this.region,
      },
    });

    submissionsTable.grantReadData(getResultFn);

    const api = new apigateway.RestApi(this, 'ResultsApi', {
      restApiName: 'satisfaction-meter-results',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
      },
    });

    const results = api.root.addResource('results');
    const submission = results.addResource('{submissionId}');
    submission.addMethod('GET', new apigateway.LambdaIntegration(getResultFn));

    new cdk.CfnOutput(this, 'ResultsApiUrl', {
      value: `${api.url}results`,
      description: 'GET /results/{submissionId} endpoint',
    });
  }
}
