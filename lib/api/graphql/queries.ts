/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getDownloadPresignedUrl = /* GraphQL */ `
  query GetDownloadPresignedUrl($key: String) {
    getDownloadPresignedUrl(key: $key) {
      bucket
      key
      presignedUrl
    }
  }
`;
