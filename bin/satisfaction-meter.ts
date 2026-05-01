#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CaptureStack } from '../lib/capture-stack';
import { InferenceStack } from '../lib/inference-stack';
import { MessagingStack } from '../lib/messaging-stack';
import { ApiStack } from '../lib/api-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const env = { account: '860550672813', region: 'ap-southeast-1' };

const captureStack = new CaptureStack(app, 'SatisfactionMeterCapture', { env });

const inferenceStack = new InferenceStack(app, 'SatisfactionMeterInference', {
  env,
  imageBucket: captureStack.imageBucket,
  submissionsTable: captureStack.submissionsTable,
});

const messagingStack = new MessagingStack(app, 'SatisfactionMeterMessaging', {
  env,
  submissionsTable: captureStack.submissionsTable,
  senderEmail: 'alexvelo199@gmail.com',
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

// explicit ordering so CDK deploys in the right sequence
inferenceStack.addDependency(captureStack);
messagingStack.addDependency(inferenceStack);
