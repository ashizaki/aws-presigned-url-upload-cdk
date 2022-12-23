import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { getSignedUrl } from "@aws-sdk/cloudfront-signer"
import { AppSyncResolverHandler } from "aws-lambda"

const client = new SecretsManagerClient({ region: process.env.REGION })

const getPresignedUrl = async (
  cloudfrontDistributionDomain: string,
  s3ObjectKey: string,
  privateKey: string,
  keyPairId: string,
  expiresIn: number,
): Promise<string> => {
  const dateLessThan = new Date()
  dateLessThan.setUTCMinutes(new Date().getUTCMinutes() + expiresIn / 60)
  console.log(`https://${cloudfrontDistributionDomain}/${s3ObjectKey}`)
  console.log(dateLessThan.toISOString())
  const signedUrl = await getSignedUrl({
    keyPairId: keyPairId,
    url: `https://${cloudfrontDistributionDomain}/${s3ObjectKey}`,
    dateLessThan: dateLessThan.toISOString(),
    privateKey: privateKey,
  })
  console.log(signedUrl)
  return signedUrl
}

export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  const key = event.arguments.key
  const { REGION, CLOUDFRONT_DISTRIBUTION_DOMAIN, PRIVATE_KEY_SECRET_ID, KEY_PAIR_ID, EXPIRES_IN } =
    process.env

  if (
    !REGION ||
    !CLOUDFRONT_DISTRIBUTION_DOMAIN ||
    !KEY_PAIR_ID ||
    !PRIVATE_KEY_SECRET_ID ||
    !EXPIRES_IN ||
    isNaN(Number(EXPIRES_IN))
  ) {
    throw new Error("invalid environment values")
  }

  const expiresIn = Number(EXPIRES_IN)

  const output = await client.send(
    new GetSecretValueCommand({
      SecretId: PRIVATE_KEY_SECRET_ID,
    }),
  )

  const secret = JSON.parse(output.SecretString!)

  const url = await getPresignedUrl(
    CLOUDFRONT_DISTRIBUTION_DOMAIN,
    key,
    secret.privateKey,
    KEY_PAIR_ID,
    expiresIn,
  )

  return {
    bucket: "",
    key: key,
    presignedUrl: url,
  }
}
