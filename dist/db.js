"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMongoUri = sanitizeMongoUri;
exports.connectDb = connectDb;
const mongoose_1 = __importDefault(require("mongoose"));
// MongoDB / Atlas connection-string options the driver actually understands.
// Anything else in the "?a=b&c=d" part (e.g. a stray "Shiping_undress=Cluster0"
// pasted in by mistake) makes mongoose 8's driver throw MongoParseError on
// startup, so we strip unknown params and warn instead of crashing.
const KNOWN_MONGO_PARAMS = new Set([
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
].map((k) => k.toLowerCase()));
/**
 * Removes query-string parameters the MongoDB driver doesn't recognise so a
 * copy/paste slip in MONGO_URI can't take the whole server down. Also logs the
 * database name actually being used (blank path = the driver default "test").
 */
function sanitizeMongoUri(raw) {
    let url;
    try {
        url = new URL(raw);
    }
    catch {
        return raw; // not URL-parseable - hand it to the driver untouched
    }
    const dropped = [];
    for (const key of [...url.searchParams.keys()]) {
        if (!KNOWN_MONGO_PARAMS.has(key.toLowerCase())) {
            url.searchParams.delete(key);
            dropped.push(key);
        }
    }
    if (dropped.length) {
        console.warn(`MONGO_URI: ignoring unsupported option(s) ${dropped.join(", ")} - ` +
            `the database name goes in the path (…mongodb.net/<dbname>), not the query string.`);
    }
    const dbName = url.pathname.replace(/^\//, "");
    console.log(`MongoDB target database: ${dbName || "test (driver default - set one in the URI path)"}`);
    return url.toString();
}
async function connectDb() {
    const raw = process.env.MONGO_URI;
    if (!raw)
        throw new Error("MONGO_URI is not set");
    await mongoose_1.default.connect(sanitizeMongoUri(raw));
    console.log("MongoDB connected");
}
