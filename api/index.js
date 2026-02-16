import express from "express";
import { ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import moment from "moment";
import clientPromise from "../lib/mongodb.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const app = express();
const corsOptions = {
  origin: ["http://localhost:5173", "https://due-test.vercel.app"],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const isProduction = process.env.VERCEL === "1";

const cookieOptions = {
  httpOnly: true,
  sameSite: isProduction ? "none" : "lax",
  secure: isProduction,
};

//////////////////////////////
// INIT INDEX ONCE
//////////////////////////////
const initIndexes = async () => {
  const client = await clientPromise;
  const db = client.db("due-sample");

  await db
    .collection("phlebotomist")
    .createIndex({ phlebotomist_id: 1 }, { unique: true });

  await db
    .collection("due-sample")
    .createIndex({ invoice: 1 }, { unique: true });
};

initIndexes();

//////////////////////////////
// AUTH MIDDLEWARE
//////////////////////////////
const verify = (req, res, next) => {
  const token = req.cookies?.pathology_token;

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_TOKEN);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden access" });

  next();
};



//////////////////////////////
// ERROR HANDLER
//////////////////////////////
const handleError = (res, error, customMessage) => {
  if (error.code === 11000) {
    return res.status(409).json({
      message: customMessage || "Duplicate key error",
    });
  }
  return res.status(500).json({ message: "Internal Server Error" });
};

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("user");

    const user = await collection.findOne({ email, password });

    if (!user)
      return res.status(404).json({
        message: "Invalid email or password",
      });

    // const token = jwt.sign(
    //   { email: user.email, role: user.role },
    //   process.env.JWT_TOKEN,
    //   { expiresIn: "1d" },
    // );

    // return res
    //   .cookie("pathology_token", token, cookieOptions)
    //   .status(200)
    //   .json({ email: user.email, role: user.role });

    return res.status(200).json({message:"ok"})
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/logout", (req, res) => {
  return res
    .clearCookie("pathology_token", cookieOptions)
    .status(200)
    .json({ message: "Logged out successfully" });
});

app.get("/overview", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");

    const results = await collection.find({}).toArray();
    return res.status(200).json({ data: results });
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/get-all-phlebotomist", async (req, res) => {
  const { page = 0, limit = 10, search = "" } = req.query;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const results = await collection
      .find(query)
      .sort({ _id: -1 })
      .skip(parseInt(page) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();

    const total = await collection.countDocuments(query);
    return res.status(200).json({ data: results, total });
  } catch (error) {
    handleError(res, error, "phlebotomist_id must be unique");
  }
});

app.post("/add-phlebotomist", isAdmin, async (req, res) => {
  const { data } = req.body;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.insertOne(data);
    return res.status(201).json(response);
  } catch (error) {
    handleError(res, error, "phlebotomist_id must be unique");
  }
});

app.patch("/update-phlebotomist",isAdmin, async (req, res) => {
  const { id, data } = req.body;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data },
    );

    return res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/delete-phlebotomist",isAdmin, async (req, res) => {
  const { id } = req.query;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/get-all-sample", async (req, res) => {
  const {
    page = 0,
    limit = 10,
    search = "",
    selectedDate = "",
    sampleStatus = "Due",
  } = req.query;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");

    const query = { status: sampleStatus };

    if (selectedDate) {
      query.filterDate = selectedDate;
    }
    if (search) query.invoice = { $regex: search, $options: "i" };

    const results = await collection
      .find(query)
      .sort({ _id: -1 })
      .skip(parseInt(page) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();

    const total = await collection.countDocuments(query);
    return res.status(200).json({ data: results, total });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/add-sample", async (req, res) => {
  const { data } = req.body;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const sampleCollection = db.collection("due-sample");
    const phlebotomistCollection = db.collection("phlebotomist");

    // Validate phlebotomist exists
    const phlebotomist = await phlebotomistCollection.findOne({
      phlebotomist_id: data.phlebotomist_id,
    });

    if (!phlebotomist) {
      return res.status(404).json({
        message: `Phlebotomist not found 😥`,
      });
    }

    const dueSample = {
      ...data,
      phlebotomist: [{ ...phlebotomist }],
      createdAt: moment().toISOString(),
      filterDate: moment().format("YYYY-MM-DD"),
      date: moment().format("D"),
      month: moment().format("MMM"),
      year: moment().format("YYYY"),
    };

    const response = await sampleCollection.insertOne(dueSample);
    return res.status(201).json(response);
  } catch (error) {
    handleError(res, error, "Invoice must be unique");
  }
});

app.patch("/update-sample", async (req, res) => {
  const { id, data } = req.body;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");
    const phlebotomistCollection = db.collection("phlebotomist");

    // Validate new phlebotomist
    const newPhlebotomist = await phlebotomistCollection.findOne({
      phlebotomist_id: data?.phlebotomist_id,
    });

    if (!newPhlebotomist) {
      return res.status(404).json({
        message: `Phlebotomist with id ${data?.phlebotomist_id} not found 😥`,
      });
    }

    // Remove phlebotomist from data if exists
    const { phlebotomist, ...otherData } = data;

    const updateData = {
      $set: {
        ...otherData,
        updatedAt: moment().toISOString(),
        updatedDate: moment().format("D"),
        updatedMonth: moment().format("MMM"),
        updatedYear: moment().format("YYYY"),
      },
      $addToSet: { phlebotomist: { ...newPhlebotomist } }, // add without conflict
    };

    const response = await collection.updateOne(
      { _id: new ObjectId(id) },
      updateData,
    );

    return res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/delete-sample", isAdmin, async (req, res) => {
  const { id } = req.query;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");

    const response = await collection.deleteOne({ _id: new ObjectId(id) });
    return res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

export default app;
