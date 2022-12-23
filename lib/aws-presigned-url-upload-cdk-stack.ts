import {
  AppsyncFunction,
  AuthorizationType,
  FieldLogLevel,
  GraphqlApi,
  MappingTemplate,
  Resolver,
  SchemaFile,
} from "@aws-cdk/aws-appsync-alpha"
import { CloudFrontToS3 } from "@aws-solutions-constructs/aws-cloudfront-s3"
import { SecretValue, Stack, StackProps } from "aws-cdk-lib"
import { KeyGroup, PublicKey } from "aws-cdk-lib/aws-cloudfront"
import { Effect, ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam"
import { Runtime } from "aws-cdk-lib/aws-lambda"
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs"
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from "aws-cdk-lib/aws-s3"
import { Secret } from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"
import * as fs from "fs"
import path from "path"

export class AwsPresignedUrlUploadCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

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
      cors: [
        {
          allowedHeaders: ["*"],
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT],
          allowedOrigins: ["*"],
          exposedHeaders: [],
          maxAge: 3000,
        },
      ],
    })

    const publicKey = fs.readFileSync(path.join(__dirname, "../keys/public_key.pem"), "utf-8")
    const privateKey = fs.readFileSync(path.join(__dirname, "../keys/private_key.pem"), "utf-8")

    const pubKey = new PublicKey(this, "CloudFrontPubKey", {
      encodedKey: publicKey,
    })

    const keyGroup = new KeyGroup(this, "KeyGroup", {
      items: [pubKey],
    })

    const cloudFront = new CloudFrontToS3(this, "CloudFront", {
      existingBucketObj: resource,
      insertHttpSecurityHeaders: false,
      cloudFrontDistributionProps: {
        defaultBehavior: {
          trustedKeyGroups: [keyGroup],
        },
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

    const secret = new Secret(this, "GenerateSecretString", {
      secretObjectValue: {
        privateKey: SecretValue.unsafePlainText(privateKey),
      },
    })

    const executionLambdaRole = new Role(this, "LambdaRole", {
      roleName: `${this.stackName}-LambdaRole`,
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
    })
    resource.grantPut(executionLambdaRole)

    const createUploadPresignedUrlLambda = new NodejsFunction(
      this,
      "CreateUploadPresignedUrlLambda",
      {
        entry: path.join(__dirname, "create-put-presigned-url-fn.ts"),
        handler: "handler",
        runtime: Runtime.NODEJS_16_X,
        role: executionLambdaRole,
        environment: {
          REGION: this.region,
          BUCKET: resource.bucketName,
          EXPIRES_IN: "3600",
        },
      },
    )

    const createDownloadPresignedUrlLambda = new NodejsFunction(
      this,
      "CreateDownloadPresignedUrlLambda",
      {
        entry: path.join(__dirname, "create-get-presigned-url-fn.ts"),
        handler: "handler",
        runtime: Runtime.NODEJS_16_X,
        role: executionLambdaRole,
        environment: {
          REGION: this.region,
          CLOUDFRONT_DISTRIBUTION_DOMAIN:
            cloudFront.cloudFrontWebDistribution.distributionDomainName,
          PRIVATE_KEY: privateKey,
          PRIVATE_KEY_SECRET_ID: secret.secretName,
          KEY_PAIR_ID: pubKey.publicKeyId,
          EXPIRES_IN: "3600",
        },
      },
    )
    const kmsPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["kms:Decrypt"],
      resources: ["*"],
    })

    createUploadPresignedUrlLambda.addToRolePolicy(kmsPolicy)
    secret.grantRead(createUploadPresignedUrlLambda)

    const api = new GraphqlApi(this, "GraphqlApi", {
      name: `${this.stackName}-GraphqlApi`,
      schema: SchemaFile.fromAsset("schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: AuthorizationType.API_KEY,
        },
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

    const createUploadPresignedUrlFunction = new AppsyncFunction(
      this,
      "createUploadPresignedUrlFunction",
      {
        api: api,
        dataSource: createUploadPresignedUrlDataSource,
        name: "CreateUploadPresignedUrlFunction",
        requestMappingTemplate: MappingTemplate.lambdaRequest(),
        responseMappingTemplate: MappingTemplate.lambdaResult(),
      },
    )

    new Resolver(this, "CreateUploadPresignedUrlResolver", {
      api: api,
      typeName: "Mutation",
      fieldName: "createUploadPresignedUrl",
      pipelineConfig: [createUploadPresignedUrlFunction],
      requestMappingTemplate: MappingTemplate.fromString("$util.toJson({})"),
      responseMappingTemplate: MappingTemplate.fromString("$util.toJson($ctx.prev.result)"),
    })

    const createDownloadPresignedUrlDataSource = api.addLambdaDataSource(
      "CreateDownloadPresignedUrlDataSource",
      createDownloadPresignedUrlLambda,
    )

    const createDownloadPresignedUrlFunction = new AppsyncFunction(
      this,
      "createDownloadPresignedUrlFunction",
      {
        api: api,
        dataSource: createDownloadPresignedUrlDataSource,
        name: "CreateDownloadPresignedUrlFunction",
        requestMappingTemplate: MappingTemplate.lambdaRequest(),
        responseMappingTemplate: MappingTemplate.lambdaResult(),
      },
    )

    new Resolver(this, "CreateDownloadPresignedUrlResolver", {
      api: api,
      typeName: "Query",
      fieldName: "getDownloadPresignedUrl",
      pipelineConfig: [createDownloadPresignedUrlFunction],
      requestMappingTemplate: MappingTemplate.fromString("$util.toJson({})"),
      responseMappingTemplate: MappingTemplate.fromString("$util.toJson($ctx.prev.result)"),
    })
  }
}
