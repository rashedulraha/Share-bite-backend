// ---------------------------
// 1. Import Packages
// ---------------------------
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();

// ! Initialize App & Port
// ---------------------------
const app = express();
const port = process.env.PORT || 3000;

//! Firebase Admin Setup
// ---------------------------
const serviceAccount = require("./serviceKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//! Middleware
// ---------------------------
app.use(cors());
app.use(express.json());

//! MongoDB Connection URI
// ---------------------------
const uri = `mongodb+srv://${process.env.SHARE_BITE_USER}:${process.env.SHARE_BITE_KEY}@simpleproject.deo4wzy.mongodb.net/?appName=SimpleProject`;

//! Create MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//! Firebase Token Verify Middleware
// ---------------------------
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email.split("@")[0],
    };
    next();
  } catch (error) {
    console.error("Token verify error:", error.message);
    return res.status(403).json({ message: "Forbidden: Invalid token" });
  }
};

//! Main Function
// ---------------------------
async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("Sharebite");
    const foodsCollection = db.collection("all-food-data");
    const requestsCollection = db.collection("foodRequests");

    // -----------------------
    //! PUBLIC ROUTES (No Auth)
    // -----------------------

    //! GET: Popular Foods (Home Page)
    app.get("/popular-food-data", async (req, res) => {
      try {
        const foods = await foodsCollection.find().limit(6).toArray();
        res.json(foods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load popular foods" });
      }
    });

    //! GET: All Foods (Search Page)
    app.get("/all-food-data", async (req, res) => {
      try {
        const foods = await foodsCollection.find().toArray();
        res.json(foods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load all foods" });
      }
    });

    //! GET: Donor Info from Food ID (Public)
    app.get("/donar-profile/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        const result = await foodsCollection.findOne(
          { _id: new ObjectId(id) },
          { projection: { donor: 1, _id: 0 } }
        );

        res.json(result || { donor: null });
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    // -----------------------
    //! PROTECTED ROUTES (Auth + Ownership)
    // -----------------------

    //! GET: Food Details (Only Logged In)
    app.get("/food-details/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid food ID" });
        }
        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) {
          return res.status(404).json({ message: "Food not found" });
        }
        res.json(food);
      } catch (err) {
        res.status(500).json({ message: "Server error" });
      }
    });

    //! GET: My Listings (Only Owner)
    app.get("/my-listings", verifyToken, async (req, res) => {
      try {
        const email = req.user.email;
        const myFoods = await foodsCollection
          .find({ "donor.email": email })
          .toArray();
        res.json(myFoods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load your listings" });
      }
    });

    //! POST: Add New Food (Only Logged In)
    app.post("/all-food-data", async (req, res) => {
      try {
        const food = req.body;

        // Basic validation
        if (!food.foodName || !food.donor?.email) {
          return res
            .status(400)
            .json({ message: "Food name and donor email required" });
        }

        // Remove _id if sent by mistake
        delete food._id;

        const result = await foodsCollection.insertOne(food);
        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
        });
      } catch (err) {
        console.error("Add Food Error:", err.message);
        res.status(500).json({ message: "Failed to add food" });
      }
    });

    //! DELETE: Remove Food (Only Owner)
    app.delete("/delete-food-data/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) {
          return res.status(404).json({ message: "Food not found" });
        }
        if (food.donor.email !== userEmail) {
          return res
            .status(403)
            .json({ message: "You can only delete your own food" });
        }

        await foodsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ success: true, message: "Food deleted" });
      } catch (err) {
        res.status(500).json({ message: "Failed to delete" });
      }
    });

    //! PUT: Update Food (Only Owner)
    app.put("/update-food/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;
        const userEmail = req.user.email;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        const food = await foodsCollection.findOne({ _id: new ObjectId(id) });
        if (!food) {
          return res.status(404).json({ message: "Food not found" });
        }
        if (food.donor.email !== userEmail) {
          return res
            .status(403)
            .json({ message: "You can only update your own food" });
        }

        delete updateData._id;
        delete updateData.donor; // Prevent donor change

        const result = await foodsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Food not found" });
        }
        res.json({ success: true, message: "Food updated" });
      } catch (err) {
        res.status(500).json({ message: "Failed to update" });
      }
    });

    //! POST: Request Food (Only Logged In)
    app.post("/food-requests", verifyToken, async (req, res) => {
      try {
        const {
          foodId,
          donorEmail,
          donorName,
          foodName,
          foodImage,
          expiryDate,
        } = req.body;

        if (!foodId || !donorEmail) {
          return res
            .status(400)
            .json({ message: "Food ID and donor email required" });
        }

        const request = {
          foodId: new ObjectId(foodId),
          foodName,
          foodImage,
          expiryDate,
          donorEmail,
          donorName,
          requesterEmail: req.user.email,
          requesterName: req.user.name,
          requestDate: new Date(),
          status: "pending",
        };

        const result = await requestsCollection.insertOne(request);
        res.status(201).json({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Request Error:", err.message);
        res.status(500).json({ message: "Failed to save request" });
      }
    });

    //! GET: My Food Requests (Donor sees who requested)
    app.get("/food-requests", verifyToken, async (req, res) => {
      try {
        const donorEmail = req.user.email;
        const requests = await requestsCollection
          .find({ donorEmail })
          .sort({ requestDate: -1 })
          .toArray();
        res.json(requests);
      } catch (err) {
        console.error("Get Requests Error:", err.message);
        res.status(500).json({ message: "Failed to fetch requests" });
      }
    });

    // -----------------------
    // Health Check
    // -----------------------
    app.get("/", (req, res) => {
      res.json({
        message: "ShareBite Server is Running!",
        timestamp: new Date(),
      });
    });

    // Ping MongoDB
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Ping Successful!");
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

//! Start Server
// ---------------------------
run().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});

//! Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await client.close();
  process.exit(0);
});
