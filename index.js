import { MongoClient } from 'mongodb';
import express from "express";
import "dotenv/config";
// import cors from "cors";

const app = express();
const PORT = 5000;

// app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectClient = await connectToMongoDB()
const db = connectClient.db("studio-space");
const allFacilitiesCollection = db.collection("allFacilities");

app.get("/", (req, res) => {
  res.send("Hello World");
});
app.listen(PORT, () => {
  console.log(`Server is runnint on: ${PORT}`);
});
