import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

interface AnalyticsStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
  // When true, look up the admin-authorizer Lambda ARN from SSM at synth time
  // and protect all /analytics/* routes with a local TokenAuthorizer.
  // Uses SSM valueFromLookup (resolves to a plain string) to avoid a CDK
  // cross-stack reference that would otherwise create a dependency cycle.
  protectWithAdminAuthorizer?: boolean;
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

    // Phase 3B: routes are protected by AdminAuthStack's TokenAuthorizer when
    // props.authorizer is supplied. The optional pattern keeps the stack
    // deployable in isolation (e.g. unit tests) without the auth stack.
    const api = new apigateway.RestApi(this, 'AnalyticsApi', {
      restApiName: 'satisfaction-meter-analytics',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
      },
    });

    // Build a local TokenAuthorizer if protectWithAdminAuthorizer is true.
    // We look up the Lambda ARN from SSM at synth time (valueFromLookup resolves
    // to a plain string — not a CloudFormation token), avoiding a CDK cross-stack
    // reference that would cause a dependency cycle between AdminAuthStack and
    // AnalyticsStack (both own a RestApi).
    //
    // On the first synth before the SSM parameter exists, valueFromLookup returns
    // a dummy placeholder; we use fromFunctionAttributes with skipPermissions to
    // survive that pass. On the second synth (after AdminAuthStack is deployed)
    // the real ARN is resolved and the authorizer is wired correctly.
    let localAuthorizer: apigateway.TokenAuthorizer | undefined;
    if (props.protectWithAdminAuthorizer) {
      const authorizerArn = ssm.StringParameter.valueFromLookup(
        this,
        '/satisfaction-meter/admin/authorizer-function-arn',
      );
      // valueFromLookup returns a dummy placeholder on the first synth before
      // the SSM parameter exists. Guard against it so CDK does not throw an ARN
      // validation error during that bootstrap pass.
      if (!authorizerArn.startsWith('dummy-value-for-')) {
        const authorizerFn = lambda.Function.fromFunctionAttributes(
          this,
          'ImportedAdminAuthorizerFn',
          {
            functionArn: authorizerArn,
            // skipPermissions: the Lambda already has a resource policy from
            // AdminAuthStack; we do not need CDK to add another grant here.
            skipPermissions: true,
            sameEnvironment: true,
          },
        );
        localAuthorizer = new apigateway.TokenAuthorizer(this, 'AnalyticsTokenAuthorizer', {
          handler: authorizerFn,
          identitySource: 'method.request.header.Authorization',
          resultsCacheTtl: cdk.Duration.minutes(5),
        });
      }
    }

    const analytics = api.root.addResource('analytics');
    const authOptions = localAuthorizer
      ? { authorizer: localAuthorizer, authorizationType: apigateway.AuthorizationType.CUSTOM }
      : {};
    analytics.addResource('emotions').addMethod('GET', new apigateway.LambdaIntegration(emotionsFn), authOptions);
    analytics.addResource('campaigns').addMethod('GET', new apigateway.LambdaIntegration(campaignsFn), authOptions);
    analytics.addResource('trends').addMethod('GET', new apigateway.LambdaIntegration(trendsFn), authOptions);

    new cdk.CfnOutput(this, 'AnalyticsApiUrl', {
      value: `${api.url}analytics`,
      description: 'Base URL for /analytics/* endpoints',
    });

    new cdk.CfnOutput(this, 'CampaignsTableName', {
      value: this.campaignsTable.tableName,
    });
  }
}
