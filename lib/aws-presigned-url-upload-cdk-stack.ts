import {
  AppsyncFunction,
  AuthorizationType,
  FieldLogLevel,
  GraphqlApi,
  MappingTemplate,
  Resolver,
  SchemaFile
} from "@aws-cdk/aws-appsync-alpha";
import {CloudFrontToS3} from "@aws-solutions-constructs/aws-cloudfront-s3";
import {Stack, StackProps} from 'aws-cdk-lib';
import {ManagedPolicy, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {BlockPublicAccess, Bucket, BucketEncryption, HttpMethods} from "aws-cdk-lib/aws-s3";
import {Construct} from 'constructs';
import path from "path";

export class AwsPresignedUrlUploadCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const logsBucket = new Bucket(this, "Logs", {
      encryption: BucketEncryption.S3_MANAGED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    })

    const resource = new Bucket(this, "Source", {
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: "source-bucket-logs/",
      encryption: BucketEncryption.S3_MANAGED,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      cors: [{
        allowedHeaders: ["*"],
        allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
        allowedOrigins: ["*"],
        exposedHeaders: [],
        maxAge: 3000,
      }]
    })

    const cloudFront = new CloudFrontToS3(this, "CloudFront", {
      existingBucketObj: resource,
      insertHttpSecurityHeaders: false,
      cloudFrontDistributionProps: {
        defaultCacheBehavior: {
          allowedMethods: ["GET", "HEAD", "OPTIONS"],
          Compress: false,
          forwardedValues: {
            queryString: false,
            headers: ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"],
            cookies: { forward: "none" },
          },
          viewerProtocolPolicy: "allow-all",
        },
        loggingConfig: {
          bucket: logsBucket,
          prefix: "cloudfront-logs",
        },
      },
    })


    const executionLambdaRole = new Role(this, "LambdaRole", {
      roleName:`${this.stackName}-LambdaRole`,
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
    })
    resource.grantPut(executionLambdaRole)

    const createUploadPresignedUrlLambda = new NodejsFunction(this, "CreateUploadPresignedUrlLambda", {
      entry: path.join(__dirname, "create-put-presigned-url-fn.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_16_X,
      role: executionLambdaRole,
      environment: {
        REGION: this.region,
        BUCKET: resource.bucketName,
        EXPIRES_IN: "3600",
      },
    })

    const api = new GraphqlApi(this, "GraphqlApi", {
      name: `${this.stackName}-GraphqlApi`,
      schema: SchemaFile.fromAsset("schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.API_KEY
        }
      },
      logConfig: {
        fieldLogLevel: FieldLogLevel.ALL,
      },
      xrayEnabled: false,
    })

    const createUploadPresignedUrlDataSource = api.addLambdaDataSource(
      "CreateUploadPresignedUrlDataSource",
      createUploadPresignedUrlLambda,
    )

    const createUploadPresignedUrlFunction = new AppsyncFunction(this, "createUploadPresignedUrlFunction", {
      api: api,
      dataSource: createUploadPresignedUrlDataSource,
      name: "CreateUploadPresignedUrlFunction",
      requestMappingTemplate: MappingTemplate.lambdaRequest(),
      responseMappingTemplate: MappingTemplate.lambdaResult(),
    })

    new Resolver(this, "CreateUploadPresignedUrlResolver", {
      api: api,
      typeName: "Mutation",
      fieldName: "createUploadPresignedUrl",
      pipelineConfig: [createUploadPresignedUrlFunction],
      requestMappingTemplate: MappingTemplate.fromString("$util.toJson({})"),
      responseMappingTemplate: MappingTemplate.fromString("$util.toJson($ctx.prev.result)"),
    })
  }
}
