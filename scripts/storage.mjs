// Adapt durable S3-compatible storage to the subset of R2 used by the Worker.
export async function createBucket(config = process.env) {
  if (!config.S3_BUCKET) {
    return { readOnly: true, async get() { return null; },
      async list() { return { objects: [], truncated: false }; },
      async put() { throw new Error('Persistent storage is not configured'); } };
  }
  const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  if (config.S3_ENDPOINT && new URL(config.S3_ENDPOINT).protocol !== 'https:') throw new Error('S3_ENDPOINT must use HTTPS');
  const client = new S3Client({
    region: config.S3_REGION || 'auto',
    ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
    ...(config.S3_ACCESS_KEY_ID || config.S3_SECRET_ACCESS_KEY ? {
      credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
    } : {}),
    forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
    maxAttempts: 3
  });
  const prefix = config.S3_PREFIX || 'baan/';
  return {
    readOnly: false,
    async get(key) {
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: prefix + key }));
        const body = await object.Body.transformToByteArray();
        return { body, json: async () => JSON.parse(new TextDecoder().decode(body)), httpMetadata: { contentType: object.ContentType } };
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
    async put(key, value, options = {}) {
      try {
        return await client.send(new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: prefix + key,
          Body: typeof value === 'string' ? value : new Uint8Array(value),
          ContentType: options.httpMetadata?.contentType || 'application/octet-stream',
          ...(options.onlyIf?.etagDoesNotMatch === '*' ? { IfNoneMatch: '*' } : {}) }));
      } catch (error) {
        if (options.onlyIf && error.$metadata?.httpStatusCode === 412) return null;
        throw error;
      }
    },
    async list({ prefix: keyPrefix = '', cursor, limit = 1000 } = {}) {
      const result = await client.send(new ListObjectsV2Command({ Bucket: config.S3_BUCKET,
        Prefix: prefix + keyPrefix, ContinuationToken: cursor, MaxKeys: limit }));
      return { objects: (result.Contents || []).map(o => ({ key: o.Key.slice(prefix.length) })),
        truncated: !!result.IsTruncated, cursor: result.NextContinuationToken };
    },
    close() { client.destroy(); }
  };
}
