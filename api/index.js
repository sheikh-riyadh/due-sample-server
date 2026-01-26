import express from "express";
import clientPromise from "../lib/mongodb.js";
import cors from "cors";
import "dotenv/config";
import { ObjectId } from "mongodb";

const app = express();
app.use(
  cors({
    origin: ["https://seller-center-32880.web.app"],
  }),
);
app.use(express.json());

/* PHLEBOTOMIST START FROM HERE  */

app.get("/get-all-phlebotomist", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const phlebotomists_collection = db.collection("phlebotomist");

    const response = await phlebotomists_collection.find({}).toArray();
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.post("/add-phlebotomist", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const phlebotomists_collection = db.collection("phlebotomist");

    const response = await phlebotomists_collection.insertOne(req.body);
    if (response?.acknowledged) {
      res.status(201).json(response);
    } else {
      res.status(500).json({ message: "Something went wrong 😥" });
    }
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.patch("/update-phlebotomist", async (req, res) => {
  const { id, data } = req.body;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const phlebotomists_collection = db.collection("phlebotomist");

    const filter_data = { _id: new ObjectId(id) };

    const updateData = {
      $set: {
        ...data,
      },
    };

    const response = await phlebotomists_collection.updateOne(
      filter_data,
      updateData,
    );
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.delete("/delete-phlebotomist", async (req, res) => {
  const { id } = req.query;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const phlebotomists_collection = db.collection("phlebotomist");

    const query = { _id: new ObjectId(id) };
    const response = await phlebotomists_collection.deleteOne(query);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

/* PHLEBOTOMIST END FROM HERE  */

/* DUE SAMPLE START FROM HERE  */

app.get("/get-all-sample", async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const sample_data_collection = db.collection("due-sample");

    const response = await sample_data_collection.find({}).toArray();
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.post("/add-sample", async (req, res) => {
  const client = await clientPromise;
  const db = client.db("due-sample");

  const sample_data_collection = db.collection("due-sample");
  const phlebotomists_collection = db.collection("phlebotomist");

  try {
    const phlebotomist = await phlebotomists_collection.findOne({
      phlebotomist_id: req.body.phlebotomist_id,
    });
    if (!phlebotomist?._id) {
      res.status(404).json({
        message: `On this ${req.body.phlebotomist_id} id phlebotomist not found 😥`,
      });
      return;
    } else {
      const due_sample = {
        ...req.body,
        status: "due",
        phlebotomist,
      };

      const response = await sample_data_collection.insertOne(due_sample);
      res.status(201).json(response);
    }
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.patch("/update-sample", async (req, res) => {
  const { id, data } = req.body;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const sample_data_collection = db.collection("due-sample");

    const filter_data = { _id: new ObjectId(id) };
    const updateData = {
      $set: {
        ...data,
      },
    };

    const response = await sample_data_collection.updateOne(
      filter_data,
      updateData,
    );
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

app.delete("/delete-sample", async (req, res) => {
  const { id } = req.query;
  try {
    const client = await clientPromise;
    const db = client.db("due-sample");
    const sample_data_collection = db.collection("phlebotomist");

    const query = { _id: new ObjectId(id) };
    const response = await sample_data_collection.deleteOne(query);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
});

/* DUE SAMPLE END FROM HERE  */

export default app;
