import { S3Client } from '@aws-sdk/client-s3';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function getPrivateStorage() {
  const endpoint = required('KYC_STORAGE_ENDPOINT');
  const region = process.env.KYC_STORAGE_REGION || 'auto';
  const accessKeyId = required('KYC_STORAGE_ACCESS_KEY_ID');
  const secretAccessKey = required('KYC_STORAGE_SECRET_ACCESS_KEY');
  const bucket = required('KYC_STORAGE_BUCKET');

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.KYC_STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}
