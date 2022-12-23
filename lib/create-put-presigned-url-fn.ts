import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { AppSyncResolverHandler } from "aws-lambda"
import { PresignedUrl } from "lib/api/graphql/API"
import { v4 as uuid } from "uuid"

const client = new S3Client({
  region: process.env.REGION,
})

const getPresignedUrl = async (bucket: string, key: string, expiresIn: number): Promise<string> => {
  const objectParams = {
    Bucket: bucket,
    Key: key,
  }
  const signedUrl = await getSignedUrl(client, new PutObjectCommand(objectParams), { expiresIn })
  console.log(signedUrl)
  return signedUrl
}

export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  const filename = event.arguments.filename
  const { REGION, BUCKET, EXPIRES_IN } = process.env

  if (!REGION || !BUCKET || !EXPIRES_IN || isNaN(Number(EXPIRES_IN))) {
    throw new Error("invalid environment values")
  }

  const guid = uuid()
  const expiresIn = Number(EXPIRES_IN)
  const key = `${guid}/${filename}`

  const url = await getPresignedUrl(BUCKET, key, expiresIn)

  return {
    bucket: BUCKET,
    key: key,
    presignedUrl: url,
  }
}
