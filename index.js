import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import "dotenv/config";
import cors from "cors";
import { jwtVerify, createRemoteJWKSet } from "jose";

const app = express();
const PORT = 5000;
const frontendUrl = (process.env.FRONTEND_URI || "http://localhost:3000")
  .trim()
  .replace(/\/+$/, "");

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === frontendUrl) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (error) {
    console.dir(error);
    throw error;
  }
}

const connectedClient = await connectToMongoDB();
const db = connectedClient.db("studio-space");
const allStudios = db.collection("all-studios");
const studioBooking = db.collection("booking-studio");
const JWKS = createRemoteJWKSet(new URL(`${frontendUrl}/api/auth/jwks`));
let bookingMutationQueue = Promise.resolve();

const normalizedEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const toMinutes = (time) => {
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const isActiveBookingStatus = (status) => {
  if (typeof status !== "string" || status.trim() === "") return true;
  return !["cancelled", "canceled", "rejected"].includes(
    status.trim().toLowerCase(),
  );
};

const withBookingLock = (operation) => {
  const result = bookingMutationQueue.then(operation, operation);
  bookingMutationQueue = result.catch(() => undefined);
  return result;
};

const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: frontendUrl,
      audience: frontendUrl,
    });
    req.user = payload;
    next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification failed:", error?.code || error?.message || error);
    }
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

app.post("/all-studios", verifyToken, async (req, res) => {
  const email = normalizedEmail(req.user.email);
  const studioData = {
    ...req.body,
    hostId: req.user.sub,
    hostName: req.user.name || "",
    hostEmail: email,
    hostImage: req.user.image || "",
    creatorId: req.user.sub,
    creatorEmail: email,
    creatorName: req.user.name || "",
    creatorImage: req.user.image || "",
    ownerId: req.user.sub,
    ownerEmail: email,
    ownerName: req.user.name || "",
    ownerImage: req.user.image || "",
  };

  const result = await allStudios.insertOne(studioData);
  res.send(result);
});

app.get("/all-studios", async (req, res) => {
  const result = await allStudios.find().toArray();
  res.send(result);
});

app.get("/my-studios/:email", verifyToken, async (req, res) => {
  const requestedEmail = normalizedEmail(req.params.email);
  const tokenEmail = normalizedEmail(req.user.email);
  if (!tokenEmail || requestedEmail !== tokenEmail) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const result = await allStudios
    .find({
      $or: [
        { ownerEmail: requestedEmail },
        { creatorEmail: requestedEmail },
        { hostEmail: requestedEmail },
      ],
    })
    .toArray();
  res.send(result);
});

app.get("/my-bookings/:email", verifyToken, async (req, res) => {
  const requestedEmail = normalizedEmail(req.params.email);
  const tokenEmail = normalizedEmail(req.user.email);
  if (!tokenEmail || requestedEmail !== tokenEmail) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const result = await studioBooking
    .find({ creatorEmail: requestedEmail })
    .toArray();
  res.send(result);
});

app.get("/all-studios/booking", verifyToken, async (req, res) => {
  const result = await studioBooking.find().toArray();
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

app.patch("/all-studios/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid studio id" });
  }
  const studio = await allStudios.findOne({ _id: new ObjectId(id) });
  const ownsStudio =
    studio &&
    (studio.ownerId === req.user.sub ||
      (!studio.ownerId &&
        normalizedEmail(studio.ownerEmail || studio.creatorEmail || studio.hostEmail) ===
          normalizedEmail(req.user.email)));
  if (!ownsStudio) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const updateData = { ...req.body };
  delete updateData.ownerId;
  delete updateData.ownerEmail;
  delete updateData.ownerName;
  delete updateData.ownerImage;
  delete updateData.creatorId;
  delete updateData.creatorEmail;
  delete updateData.creatorName;
  delete updateData.creatorImage;
  delete updateData.hostId;
  delete updateData.hostEmail;
  delete updateData.hostName;
  delete updateData.hostImage;
  const result = await allStudios.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData },
  );
  res.send(result);
});

app.delete("/all-studios/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid studio id" });
  }
  const studio = await allStudios.findOne({ _id: new ObjectId(id) });
  const ownsStudio =
    studio &&
    (studio.ownerId === req.user.sub ||
      (!studio.ownerId &&
        normalizedEmail(studio.ownerEmail || studio.creatorEmail || studio.hostEmail) ===
          normalizedEmail(req.user.email)));
  if (!ownsStudio) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const result = await allStudios.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

const createBooking = async (req, res) => {
  await withBookingLock(async () => {
    const email = normalizedEmail(req.user.email);
    const studioId = typeof req.body.studioId === "string"
      ? req.body.studioId.trim()
      : "";
    const bookingDate = typeof req.body.bookingDate === "string"
      ? req.body.bookingDate.trim()
      : "";
    const startTime = typeof req.body.startTime === "string"
      ? req.body.startTime.trim()
      : "";
    const endTime = typeof req.body.endTime === "string"
      ? req.body.endTime.trim()
      : "";
    const newStart = toMinutes(startTime);
    const newEnd = toMinutes(endTime);

    if (!studioId || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
      res.status(400).send({
        message: "Studio and a valid booking date are required.",
      });
      return;
    }
    if (newStart === null || newEnd === null || newEnd <= newStart) {
      res.status(400).send({
        message: "Please choose a valid start and end time.",
      });
      return;
    }

    const existingBookings = await studioBooking.find({
      studioId,
      bookingDate,
    }).toArray();

    const overlappingBooking = existingBookings.find((booking) => {
      if (!isActiveBookingStatus(booking.status)) return false;

      const existingStart = toMinutes(booking.startTime);
      const existingEnd = toMinutes(booking.endTime);
      if (existingStart === null || existingEnd === null) return false;

      return newStart < existingEnd && newEnd > existingStart;
    });

    if (overlappingBooking) {
      res.status(409).send({
        message: "This studio is already booked for the selected time. Please choose another time.",
      });
      return;
    }

    const bookingData = {
      ...req.body,
      studioId,
      bookingDate,
      startTime,
      endTime,
      creatorId: req.user.sub,
      creatorEmail: email,
      creatorName: req.user.name || "",
      creatorImage: req.user.image || "",
      status: "pending",
    };
    const result = await studioBooking.insertOne(bookingData);
    res.send(result);
  });
};

app.post("/all-studios/booking", verifyToken, createBooking);
app.post("/api/bookings", verifyToken, createBooking);

app.get("/all-studios/booking/:email", verifyToken, async (req, res) => {
  const requestedEmail = normalizedEmail(req.params.email);
  const tokenEmail = normalizedEmail(req.user.email);
  if (!tokenEmail || requestedEmail !== tokenEmail) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const result = await studioBooking
    .find({ creatorEmail: requestedEmail })
    .toArray();
  res.send(result);
});

app.patch("/all-studios/booking/:id/cancel", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid booking id" });
  }
  const booking = await studioBooking.findOne({ _id: new ObjectId(id) });
  if (
    !booking ||
    normalizedEmail(booking.creatorEmail) !== normalizedEmail(req.user.email)
  ) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  const result = await studioBooking.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "cancelled" } },
  );
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("Studio Space API is running");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app