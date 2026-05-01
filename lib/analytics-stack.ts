import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface AnalyticsStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
}

export class AnalyticsStack extends cdk.Stack {
  public readonly campaignsTable: dynamodb.Table;
  public readonly analyticsEmotionsFunction: lambda.IFunction;
  public readonly analyticsCampaignsFunction: lambda.IFunction;
  public readonly analyticsTrendsFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
    super(scope, id, props);

    const { submissionsTable } = props;

    // Campaigns table — one record per SES send. No TTL: analytics must outlive
    // the 30-day submissions retention window so historical campaign volume survives.
    this.campaignsTable = new dynamodb.Table(this, 'CampaignsTable', {
      partitionKey: { name: 'submissionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const commonFnProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
    };

    const emotionsFn = new NodejsFunction(this, 'AnalyticsEmotionsFunction', {
      ...commonFnProps,
      entry: path.join(__dirname, '../lambdas/analytics-emotions/index.ts'),
      handler: 'handler',
      environment: {
        SUBMISSIONS_TABLE_NAME: submissionsTable.tableName,
        REGION: this.region,
      },
    });
    submissionsTable.grantReadData(emotionsFn);

    const campaignsFn = new NodejsFunction(this, 'AnalyticsCampaignsFunction', {
      ...commonFnProps,
      entry: path.join(__dirname, '../lambdas/analytics-campaigns/index.ts'),
      handler: 'handler',
      environment: {
        CAMPAIGNS_TABLE_NAME: this.campaignsTable.tableName,
        REGION: this.region,
      },
    });
    this.campaignsTable.grantReadData(campaignsFn);

    const trendsFn = new NodejsFunction(this, 'AnalyticsTrendsFunction', {
      ...commonFnProps,
      entry: path.join(__dirname, '../lambdas/analytics-trends/index.ts'),
      handler: 'handler',
      environment: {
        SUBMISSIONS_TABLE_NAME: submissionsTable.tableName,
        REGION: this.region,
      },
    });
    submissionsTable.grantReadData(trendsFn);

    this.analyticsEmotionsFunction = emotionsFn;
    this.analyticsCampaignsFunction = campaignsFn;
    this.analyticsTrendsFunction = trendsFn;

    // NOTE: routes are intentionally open during Phase 3A. Phase 3B adds a
    // Lambda Authorizer backed by SSM Parameter Store admin credentials.
    const api = new apigateway.RestApi(this, 'AnalyticsApi', {
      restApiName: 'satisfaction-meter-analytics',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
      },
    });

    const analytics = api.root.addResource('analytics');
    analytics.addResource('emotions').addMethod('GET', new apigateway.LambdaIntegration(emotionsFn));
    analytics.addResource('campaigns').addMethod('GET', new apigateway.LambdaIntegration(campaignsFn));
    analytics.addResource('trends').addMethod('GET', new apigateway.LambdaIntegration(trendsFn));

    new cdk.CfnOutput(this, 'AnalyticsApiUrl', {
      value: `${api.url}analytics`,
      description: 'Base URL for /analytics/* endpoints',
    });

    new cdk.CfnOutput(this, 'CampaignsTableName', {
      value: this.campaignsTable.tableName,
    });
  }
}
