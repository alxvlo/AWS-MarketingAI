import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";

interface AdminAuthStackProps extends cdk.StackProps {
  submissionsTable: dynamodb.Table;
}

export class AdminAuthStack extends cdk.Stack {
  public readonly authorizer: apigateway.TokenAuthorizer;
  public readonly authorizerFunction: lambda.IFunction;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: AdminAuthStackProps) {
    super(scope, id, props);

    const usernameParam = "/satisfaction-meter/admin/username";
    const passwordParam = "/satisfaction-meter/admin/password";

    const env = {
      ADMIN_USERNAME_PARAM: usernameParam,
      ADMIN_PASSWORD_PARAM: passwordParam,
    };

    const grantSsm = (fn: lambda.IFunction, suffix: string) => {
      ssm.StringParameter.fromStringParameterName(this, `UsernameGrant${suffix}`, usernameParam).grantRead(fn);
      ssm.StringParameter.fromSecureStringParameterAttributes(this, `PasswordGrant${suffix}`, {
        parameterName: passwordParam,
      }).grantRead(fn);
    };

    const loginFn = new NodejsFunction(this, "AdminLoginFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-login/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(5),
      environment: env,
    });
    grantSsm(loginFn, "Login");

    const authorizerFn = new NodejsFunction(this, "AdminAuthorizerFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-authorizer/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(5),
      environment: env,
    });
    grantSsm(authorizerFn, "Authorizer");
    this.authorizerFunction = authorizerFn;

    // Store the authorizer Lambda ARN in SSM so other stacks can look it up
    // at synth time without creating a CDK cross-stack reference (which would
    // cause a dependency cycle when those stacks also own a RestApi).
    new ssm.StringParameter(this, 'AuthorizerFunctionArnParam', {
      parameterName: '/satisfaction-meter/admin/authorizer-function-arn',
      stringValue: authorizerFn.functionArn,
      description: 'ARN of the admin-authorizer Lambda for use by other stacks',
    });

    const submissionsFn = new NodejsFunction(this, "AdminSubmissionsFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../lambdas/admin-submissions/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(10),
      environment: { SUBMISSIONS_TABLE_NAME: props.submissionsTable.tableName },
    });
    props.submissionsTable.grantReadData(submissionsFn);

    this.api = new apigateway.RestApi(this, "AdminApi", {
      restApiName: "satisfaction-meter-admin",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });

    // CORS headers on API Gateway-generated 4xx/5xx so the browser surfaces
    // the real status code instead of an opaque "blocked by CORS policy".
    this.api.addGatewayResponse("Default4xx", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
      },
    });
    this.api.addGatewayResponse("Default5xx", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization'",
      },
    });

    this.authorizer = new apigateway.TokenAuthorizer(this, "AdminTokenAuthorizer", {
      handler: authorizerFn,
      identitySource: "method.request.header.Authorization",
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    const admin = this.api.root.addResource("admin");
    admin.addResource("login").addMethod("POST", new apigateway.LambdaIntegration(loginFn));
    admin.addResource("submissions").addMethod("GET", new apigateway.LambdaIntegration(submissionsFn), {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    new cdk.CfnOutput(this, "AdminApiUrl", { value: this.api.url, description: "Base URL for /admin/*" });
    new cdk.CfnOutput(this, "AdminLoginUrl", { value: `${this.api.url}admin/login` });
  }
}
