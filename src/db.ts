import mongoose from "mongoose";

// MongoDB / Atlas connection-string options the driver actually understands.
// Anything else in the "?a=b&c=d" part (e.g. a stray "Shiping_undress=Cluster0"
// pasted in by mistake) makes mongoose 8's driver throw MongoParseError on
// startup, so we strip unknown params and warn instead of crashing.
const KNOWN_MONGO_PARAMS = new Set(
  [
    "retryWrites",
    "w",
    "wtimeoutMS",
    "journal",
    "appName",
    "authSource",
    "authMechanism",
    "authMechanismProperties",
    "replicaSet",
    "tls",
    "ssl",
    "tlsAllowInvalidCertificates",
    "tlsAllowInvalidHostnames",
    "tlsCAFile",
    "tlsCertificateKeyFile",
    "tlsInsecure",
    "readPreference",
    "readPreferenceTags",
    "readConcernLevel",
    "maxPoolSize",
    "minPoolSize",
    "maxIdleTimeMS",
    "maxConnecting",
    "waitQueueTimeoutMS",
    "serverSelectionTimeoutMS",
    "connectTimeoutMS",
    "socketTimeoutMS",
    "heartbeatFrequencyMS",
    "directConnection",
    "loadBalanced",
    "srvMaxHosts",
    "srvServiceName",
    "compressors",
    "zlibCompressionLevel",
    "localThresholdMS",
    "retryReads",
    "uuidRepresentation",
  ].map((k) => k.toLowerCase())
);

/**
 * Removes query-string parameters the MongoDB driver doesn't recognise so a
 * copy/paste slip in MONGO_URI can't take the whole server down. Also logs the
 * database name actually being used (blank path = the driver default "test").
 */
export function sanitizeMongoUri(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw; // not URL-parseable - hand it to the driver untouched
  }

  const dropped: string[] = [];
  for (const key of [...url.searchParams.keys()]) {
    if (!KNOWN_MONGO_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
      dropped.push(key);
    }
  }

  if (dropped.length) {
    console.warn(
      `MONGO_URI: ignoring unsupported option(s) ${dropped.join(", ")} - ` +
        `the database name goes in the path (…mongodb.net/<dbname>), not the query string.`
    );
  }

  const dbName = url.pathname.replace(/^\//, "");
  console.log(`MongoDB target database: ${dbName || "test (driver default - set one in the URI path)"}`);

  return url.toString();
}

export async function connectDb(): Promise<void> {
  const raw = process.env.MONGO_URI;
  if (!raw) throw new Error("MONGO_URI is not set");
  await mongoose.connect(sanitizeMongoUri(raw));
  console.log("MongoDB connected");
}
