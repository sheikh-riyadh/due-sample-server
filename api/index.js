import express from "express";
import clientPromise from "../lib/mongodb.js";
import cors from "cors";
import "dotenv/config";



const app = express();
app.use(cors());
app.use(express.json());



app.get("/", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("due-sample"); // তোমার DB name
    const collections = await db.collection('due-sample');

    res.json({
      success: true,
      message: "🔥 MongoDB connected (native)",
      collections
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default app;