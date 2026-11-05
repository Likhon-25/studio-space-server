import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import "dotenv/config";
import cors from "cors";

const app = express();
const PORT = 5000;

app.use(
  cors({
    origin: "http://localhost:3000",
  }),
);
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

const connectClient = await connectToMongoDB();
const db = connectClient.db("studio-space");
const allStudios = db.collection("all-studios");
const studioBooking = db.collection("booking-studio");

app.post("/all-studios", async (req, res) => {
  const studioData = req.body;

  const result = await allStudios.insertOne(studioData);
  res.send(result);
});

app.get("/all-studios", async (req, res) => {
  const result = await allStudios.find().toArray();
  res.send(result);
});

app.get("/my-studios/:email", async (req, res) => {
  const email = req.params.email;
  console.log(email, "email");
  const result = await allStudios.find({ creatorEmail: email }).toArray();
  res.send(result);
});

app.get("/my-bookings/:email", async (req, res) => {
  const email = req.params.email;
  console.log(email, "booking email");
  const result = await studioBooking.find({ creatorEmail: email }).toArray();
  res.send(result);
});

app.get("/all-studios/booking", async (req, res) => {
  const result = await allStudios.find().toArray();
  res.send(result);
});

app.get("/all-studios/:id", async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid studio id" });
  }
  const result = await allStudios.findOne({ _id: new ObjectId(id) });

  res.send(result);
});

app.patch("/all-studios/:id", async(req, res) =>{
  const id = req .params.id
  const updateData = req.body
  const result = await  allStudios.updateOne(
    {_id:  new ObjectId(id)},
    {$set: updateData}
  )

  res.send(result)
})

app.delete("/all-studios/:id",  async(req, res) =>{
  const id = req.params.id
  const result = await allStudios.deleteOne({_id:  new ObjectId(id)})
  res.send(result)
})

app.post("/all-studios/booking", async (req, res) => {
  const bookingData = req.body;
  const result = await studioBooking.insertOne(bookingData);
  res.send(result);

  console.log(result);
});

// app.get("/all-studios")

app.get("/", (req, res) => {
  res.send("Studio Space API is running");
});
app.listen(PORT, () => {
  console.log(`Server is runnint on: ${PORT}`);
});
