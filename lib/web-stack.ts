import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

/**
 * Hosts the Next.js static export at frontend/out/.
 *
 * Layout:
 *   - Private S3 bucket (no public access)
 *   - CloudFront distribution with Origin Access Control (OAC) — modern replacement for OAI
 *   - SPA-style 403/404 → /404.html so deep links resolve to Next's static 404 page
 *
 * The bucket is intentionally NOT in CaptureStack: customer-image and static-asset
 * buckets have very different lifecycles (30-day TTL vs none) and IAM surfaces.
 */
export class WebStack extends cdk.Stack {
  public readonly siteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `satisfaction-meter-web-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // Site assets are CI-rebuildable — destroy on stack delete is safe.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // Next.js static export emits a 404.html. Map S3's 403 (which it returns for
      // missing keys when listing is disabled) and any 404 to that page.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html', ttl: cdk.Duration.minutes(5) },
      ],
      // PRICE_CLASS_200 includes Asia (PH) without paying for South America/Australia/NZ edges.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      comment: 'Satisfaction Meter — Next.js static frontend',
    });

    new cdk.CfnOutput(this, 'SiteBucketName', { value: this.siteBucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
    new cdk.CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
  }
}
