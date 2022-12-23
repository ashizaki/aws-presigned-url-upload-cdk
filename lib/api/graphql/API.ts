/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type PresignedUrl = {
  __typename: "PresignedUrl",
  bucket?: string | null,
  key?: string | null,
  presignedUrl?: string | null,
};

export type CreateUploadPresignedUrlMutationVariables = {
  filename?: string | null,
};

export type CreateUploadPresignedUrlMutation = {
  createUploadPresignedUrl?:  {
    __typename: "PresignedUrl",
    bucket?: string | null,
    key?: string | null,
    presignedUrl?: string | null,
  } | null,
};

export type GetDownloadPresignedUrlQueryVariables = {
  key?: string | null,
};

export type GetDownloadPresignedUrlQuery = {
  getDownloadPresignedUrl?:  {
    __typename: "PresignedUrl",
    bucket?: string | null,
    key?: string | null,
    presignedUrl?: string | null,
  } | null,
};
