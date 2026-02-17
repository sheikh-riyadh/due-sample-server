import express from "express";
import { ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import moment from "moment";
import clientPromise from "../lib/mongodb.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "https://due-test.vercel.app"
];

const corsOptions = {
  origin: function (origin, callback) {
    // browser থেকে কোনো request origin আছে কিনা check
    if (!origin) return callback(null, true); // Postman বা server-side request
    if (allowedOrigins.includes(origin)) {
      callback(null, true); // allowed
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // cookies / auth support
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
    .createIndexes([
      { key: { invoice: 1 }, unique: true },
      { key: { status: 1, filterDate: 1 } },
      { key: { filterDate: 1 } },
    ]);
};

initIndexes();

const buildQuery = (filters) => {
  const query = {};

  if (filters.invoice) {
    query.invoice = filters.invoice;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.date) {
    const startDate = moment(filters.date, "YYYY-MM-DD")
      .startOf("day")
      .toDate();

    const nextDate = moment(filters.date, "YYYY-MM-DD")
      .add(1, "day")
      .startOf("day")
      .toDate();

    query.filterDate = {
      $gte: startDate,
      $lt: nextDate,
    };
  }

  return query;
};

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

    const token = jwt.sign(
      { email: user.email, role: user.role },
      process.env.JWT_TOKEN,
      { expiresIn: "1d" },
    );

    return res
      .cookie("pathology_token", token, cookieOptions)
      .status(200)
      .json({ email: user.email, role: user.role });
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

app.get("/overview", verify, async (req, res) => {
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

app.get("/get-all-phlebotomist", verify, async (req, res) => {
  const { page = 0, limit = 10, search = "" } = req.query;

  const projection = {};

  if (req.user.role !== "admin") {
    projection.phlebotomist_id = 0;
  }

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("phlebotomist");

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    const results = await collection
      .find(query,{projection})
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

app.post("/add-phlebotomist", verify, isAdmin, async (req, res) => {
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

app.patch("/update-phlebotomist", verify, isAdmin, async (req, res) => {
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

app.delete("/delete-phlebotomist", verify, isAdmin, async (req, res) => {
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

app.get("/get-all-sample", verify, async (req, res) => {
  const { page = 0, limit = 10, status, date, invoice } = req.query;

  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const collection = db.collection("due-sample");
    const filters = {
      invoice,
      status,
      date,
    };
    const query = buildQuery(filters);
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

app.post("/add-sample", verify, async (req, res) => {
  const { data } = req.body;
  const now = moment.tz("Asia/Dhaka");
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
      createdAt: now.toISOString(),
      filterDate: now.startOf("day").toDate(),
      date: now.format("D"),
      month: now.format("MMM"),
      year: now.format("YYYY"),
    };

    const response = await sampleCollection.insertOne(dueSample);
    return res.status(201).json(response);
  } catch (error) {
    handleError(res, error, "Invoice must be unique");
  }
});

app.patch("/update-sample", verify, async (req, res) => {
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

app.delete("/delete-sample", verify, isAdmin, async (req, res) => {
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
