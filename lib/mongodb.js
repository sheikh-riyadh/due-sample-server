import { MongoClient } from "mongodb";

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.wjboujk.mongodb.net/?appName=Cluster0`;
let client;
let clientPromise;



if (!uri) {
  throw new Error("❌ MONGO_URI not defined");
}

if (!global._mongoClientPromise) {
  client = new MongoClient(uri);
  global._mongoClientPromise = client.connect();
}

clientPromise = global._mongoClientPromise;

export default clientPromise;