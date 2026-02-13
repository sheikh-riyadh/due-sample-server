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
  origin: process.env.FRONTEND_URL,
  credentials: true,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  secure: process.env.NODE_ENV === "production" ? true : false,
};

const verify = async (req, res, next) => {
  const token = req.cookies?.pathology_token;
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  jwt.verify(token, process.env.JWT_TOKEN, (error, decoded) => {
    if (error) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    req.user = decoded;
    next();
  });
};

// ========== UTILITY ==========
const handleError = (res, error, customMessage) => {
  if (error.code === 11000) {
    return res
      .status(409)
      .json({ message: customMessage || "Duplicate key error" });
  }
  return res.status(500).json({ message: "An error occurred" });
};

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("user");

    const user = await collection.findOne({ email, password });
    if (user?._id) {
      const token = jwt.sign(
        { email: user.email, role: user.role },
        process.env.JWT_TOKEN,
        {
          expiresIn: "1d",
        },
      );
      res
        .cookie("pathology_token", token, cookieOptions)
        .status(200)
        .json({ email: user?.email, role: user?.role });
      return;
    } else {
      res.status(404).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    handleError(res, error, "Something went wrong");
  }
});

app.get("/logout", async (req, res) => {
  res
    .clearCookie("pathology_token", cookieOptions)
    .status(200)
    .json({ message: "success" });
});

app.get("/overview", verify, async (req, res) => {
  const { email } = req.query;
  if (email !== req?.user?.email) {
    res.status(403).json({ message: "forbidden access" });
    return;
  }
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");

    const results = await collection.find({}).toArray();
    res.status(200).json({ data: results });
  } catch (error) {
    handleError(res, error);
  }
});

// ========== PHLEBOTOMIST ROUTES ==========
app.get("/get-all-phlebotomist", verify, async (req, res) => {
  const { page = 0, limit = 10, search = "", email } = req.query;

  if (email !== req?.user?.email) {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    // One-time unique index (safe)
    await collection.createIndex({ phlebotomist_id: 1 }, { unique: true });

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const results = await collection
      .find(query)
      .sort({ _id: -1 })
      .skip(parseInt(page) * parseInt(limit))
      .limit(parseInt(limit))
      .toArray();

    const total = await collection.countDocuments(query);

    res.status(200).json({ data: results, total });
  } catch (error) {
    handleError(res, error, "phlebotomist_id must be unique");
  }
});

app.post("/add-phlebotomist", verify, async (req, res) => {
  const { data, email } = req.body;

  if (email !== req?.user?.email || req.user.role !== "admin") {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.insertOne(data);
    res.status(201).json(response);
  } catch (error) {
    handleError(res, error, "phlebotomist_id must be unique");
  }
});

app.patch("/update-phlebotomist", verify, async (req, res) => {
  const { id, data, email } = req.body;

  if (email !== req?.user?.email || req.user.role !== "admin") {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data },
    );

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/delete-phlebotomist", verify, async (req, res) => {
  const { id, email } = req.query;

  if (email !== req?.user?.email || req.user.role !== "admin") {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const response = await collection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

// ========== DUE SAMPLE ROUTES ==========

app.get("/get-all-sample", verify, async (req, res) => {
  const {
    page = 0,
    limit = 10,
    search = "",
    selectedDate = "",
    sampleStatus = "Due",
    email,
  } = req.query;

  if (email !== req?.user?.email) {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

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

    res.status(200).json({ data: results, total });
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/add-sample", verify, async (req, res) => {
  const { data, email } = req.body;
  if (email !== req?.user?.email) {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const sampleCollection = db.collection("due-sample");
    const phlebotomistCollection = db.collection("phlebotomist");

    // Ensure unique invoice index (one-time)
    await sampleCollection.createIndex({ invoice: 1 }, { unique: true });

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
      ...data, // includes invoice sent from front-end
      phlebotomist: [{ ...phlebotomist }],
      createdAt: moment().toISOString(),
      filterDate: moment().format("YYYY-MM-DD"),
      date: moment().format("D"),
      month: moment().format("MMM"),
      year: moment().format("YYYY"),
    };

    const response = await sampleCollection.insertOne(dueSample);
    res.status(201).json(response);
  } catch (error) {
    handleError(res, error, "Invoice must be unique");
  }
});

app.patch("/update-sample", verify, async (req, res) => {
  const { id, data, email } = req.body;

  if (email !== req?.user?.email) {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

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

    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/delete-sample", verify, async (req, res) => {
  const { id, email } = req.query;

  if (email !== req?.user?.email || req.user.role !== "admin") {
    res.status(403).json({ message: "forbidden access" });
    return;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");

    const response = await collection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
});

export default app;
