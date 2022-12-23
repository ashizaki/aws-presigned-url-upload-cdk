/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createUploadPresignedUrl = /* GraphQL */ `
  mutation CreateUploadPresignedUrl($filename: String) {
    createUploadPresignedUrl(filename: $filename) {
      bucket
      key
      presignedUrl
    }
  }
`;
