#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CaptureStack } from '../lib/capture-stack';
import { AnalyticsStack } from '../lib/analytics-stack';
import { InferenceStack } from '../lib/inference-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { ApiStack } from '../lib/api-stack';
import { ObservabilityStack } from '../lib/observability-stack';
import { WebStack } from '../lib/web-stack';
import { AdminAuthStack } from '../lib/admin-auth-stack';

const app = new cdk.App();

const env = { account: '860550672813', region: 'ap-southeast-1' };

const captureStack = new CaptureStack(app, 'SatisfactionMeterCapture', { env });

const adminAuthStack = new AdminAuthStack(app, 'SatisfactionMeterAdminAuth', {
  env,
  submissionsTable: captureStack.submissionsTable,
});

const analyticsStack = new AnalyticsStack(app, 'SatisfactionMeterAnalytics', {
  env,
  submissionsTable: captureStack.submissionsTable,
  protectWithAdminAuthorizer: true,
});

const inferenceStack = new InferenceStack(app, 'SatisfactionMeterInference', {
  env,
  imageBucket: captureStack.imageBucket,
  submissionsTable: captureStack.submissionsTable,
});

const messagingStack = new MessagingStack(app, 'SatisfactionMeterMessaging', {
  env,
  submissionsTable: captureStack.submissionsTable,
  campaignsTable: analyticsStack.campaignsTable,
  senderEmail: 'noreply@satisfactionmeter.live',
});

const apiStack = new ApiStack(app, 'SatisfactionMeterApi', {
  env,
  imageBucket: captureStack.imageBucket,
  submissionsTable: captureStack.submissionsTable,
});

new ObservabilityStack(app, 'SatisfactionMeterObservability', {
  env,
  presignedUrlFunction: captureStack.presignedUrlFunction,
  inferenceFunction: inferenceStack.inferenceFunction,
  sendEmailFunction: messagingStack.sendEmailFunction,
  getResultFunction: apiStack.getResultFunction,
  inferenceDlq: inferenceStack.inferenceDlq,
  messagingDlq: messagingStack.messagingDlq,
});

new WebStack(app, 'SatisfactionMeterWeb', { env });

// explicit ordering so CDK deploys in the right sequence
analyticsStack.addDependency(captureStack);
// analyticsStack -> adminAuthStack ordering is implicit via cross-stack
// authorizerFunction reference; no explicit addDependency needed here.
inferenceStack.addDependency(captureStack);
messagingStack.addDependency(analyticsStack);
messagingStack.addDependency(inferenceStack);
adminAuthStack.addDependency(captureStack);
