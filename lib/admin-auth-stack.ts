import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface DashboardApiStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
}

/**
 * Public dashboard data API.
 *
 * The source filename and deployed stack ID are retained to update the existing
 * CloudFormation stack in place instead of replacing its API URL.
 */
export class DashboardApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: DashboardApiStackProps) {
    super(scope, id, props);

    const submissionsFn = new NodejsFunction(this, "AdminSubmissionsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-submissions/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(10),
      environment: { SUBMISSIONS_TABLE_NAME: props.submissionsTable.tableName },
    });
    props.submissionsTable.grantReadData(submissionsFn);

    this.api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "satisfaction-meter-dashboard",
      deployOptions: {
        throttlingRateLimit: 10,
        throttlingBurstLimit: 20,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "OPTIONS"],
        allowHeaders: ["Content-Type"],
      },
    });

    this.api.addGatewayResponse("Default4xx", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type'",
      },
    });
    this.api.addGatewayResponse("Default5xx", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type'",
      },
    });

    const admin = this.api.root.addResource("admin");
    admin.addResource("submissions").addMethod("GET", new apigateway.LambdaIntegration(submissionsFn));

    new cdk.CfnOutput(this, "AdminApiUrl", {
      value: this.api.url,
      description: "Base URL for the public dashboard API",
    });
  }
}
