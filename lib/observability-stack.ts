import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

interface ObservabilityStackProps extends cdk.StackProps {
  // Lambdas to monitor
  presignedUrlFunction: lambda.IFunction;
  inferenceFunction: lambda.IFunction;
  sendEmailFunction: lambda.IFunction;
  getResultFunction: lambda.IFunction;
  // DLQs to monitor
  inferenceDlq: sqs.Queue;
  messagingDlq: sqs.Queue;
}

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const {
      presignedUrlFunction,
      inferenceFunction,
      sendEmailFunction,
      getResultFunction,
      inferenceDlq,
      messagingDlq,
    } = props;

    const dashboard = new cloudwatch.Dashboard(this, 'SatisfactionMeterDashboard', {
      dashboardName: 'SatisfactionMeter',
    });

    // ── Row 1: Lambda Errors ─────────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        width: 24,
        left: [
          presignedUrlFunction.metricErrors({ label: 'PresignedUrl', period: cdk.Duration.minutes(5) }),
          inferenceFunction.metricErrors({ label: 'Inference', period: cdk.Duration.minutes(5) }),
          sendEmailFunction.metricErrors({ label: 'SendEmail', period: cdk.Duration.minutes(5) }),
          getResultFunction.metricErrors({ label: 'GetResult', period: cdk.Duration.minutes(5) }),
        ],
      }),
    );

    // ── Row 2: Lambda Invocations ────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations',
        width: 24,
        left: [
          presignedUrlFunction.metricInvocations({ label: 'PresignedUrl', period: cdk.Duration.minutes(5) }),
          inferenceFunction.metricInvocations({ label: 'Inference', period: cdk.Duration.minutes(5) }),
          sendEmailFunction.metricInvocations({ label: 'SendEmail', period: cdk.Duration.minutes(5) }),
          getResultFunction.metricInvocations({ label: 'GetResult', period: cdk.Duration.minutes(5) }),
        ],
      }),
    );

    // ── Row 3: Lambda Duration (async Lambdas — the ones that can be slow) ───
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration — Inference (ms)',
        width: 12,
        left: [
          inferenceFunction.metricDuration({ label: 'P50', statistic: 'p50', period: cdk.Duration.minutes(5) }),
          inferenceFunction.metricDuration({ label: 'P99', statistic: 'p99', period: cdk.Duration.minutes(5) }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration — SendEmail (ms)',
        width: 12,
        left: [
          sendEmailFunction.metricDuration({ label: 'P50', statistic: 'p50', period: cdk.Duration.minutes(5) }),
          sendEmailFunction.metricDuration({ label: 'P99', statistic: 'p99', period: cdk.Duration.minutes(5) }),
        ],
      }),
    );

    // ── Row 4: DLQ Depth ─────────────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DLQ Depth — Inference',
        width: 12,
        left: [
          inferenceDlq.metricApproximateNumberOfMessagesVisible({
            label: 'Messages in DLQ',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DLQ Depth — Messaging',
        width: 12,
        left: [
          messagingDlq.metricApproximateNumberOfMessagesVisible({
            label: 'Messages in DLQ',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
    );

    // ── Row 5: SES Metrics ───────────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SES Email Delivery',
        width: 24,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SES',
            metricName: 'Send',
            label: 'Sent',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SES',
            metricName: 'Bounce',
            label: 'Bounced',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SES',
            metricName: 'Complaint',
            label: 'Complaints',
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
      }),
    );
  }
}
