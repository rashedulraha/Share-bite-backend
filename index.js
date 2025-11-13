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

//! firebase token verify
// ---------------------------
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const user = await admin.auth().verifyIdToken(token);
    req.user = user; // Attach user to request
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden: Invalid token" });
  }
};

//! main function
// ---------------------------
async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("Sharebite");
    const foodsCollection = db.collection("all-food-data");
    const requestsCollection = db.collection("foodRequests");

    //! GET: popular foods
    // -----------------------
    app.get("/popular-food-data", async (req, res) => {
      try {
        const foods = await foodsCollection.find().limit(6).toArray();
        res.json(foods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load popular foods" });
      }
    });

    //! GET: all foods
    // -----------------------
    app.get("/all-food-data", async (req, res) => {
      try {
        const foods = await foodsCollection.find().toArray();
        res.json(foods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load all foods" });
      }
    });

    //! GET:post food requests
    // -----------------------
    // app.get("/request-food", async (req, res) => {
    //   try {
    //     const requests = await requestsCollection.find().toArray();
    //     res.json(requests);
    //   } catch (err) {
    //     res.status(500).json({ message: "Failed to load requests" });
    //   }
    // });

    //! POST: add bew food
    // -----------------------
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

    // -----------------------
    //! GET: food Details
    // -----------------------
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

    //! GET: donor info from food
    // -----------------------
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

    //! GET: my listings
    // -----------------------
    app.get("/my-listings", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        const myFoods = await foodsCollection
          .find({ "donor.email": email })
          .toArray();

        res.json(myFoods);
      } catch (err) {
        res.status(500).json({ message: "Failed to load your listings" });
      }
    });

    //! DELETE: remove food
    // -----------------------
    app.delete("/delete-food-data/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        const result = await foodsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Food not found" });
        }

        res.json({ success: true, message: "Food deleted" });
      } catch (err) {
        res.status(500).json({ message: "Failed to delete" });
      }
    });

    //! PUT: update food
    // -----------------------
    app.put("/update-food/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid ID" });
        }

        delete updateData._id;

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

    //! POST: request food
    app.post("/food-requests", async (req, res) => {
      try {
        const request = req?.body;
        const result = await requestsCollection.insertOne(request);
        res.status(200).send(result);
      } catch (err) {
        console.error("Request Error:", err.message);
        res.status(500).json({ message: "Failed to save request" });
      }
    });

    //!  GET: food request by email id
    app.get("/food-requests", async (req, res) => {
      try {
        const email = req.query.email;

        let query = {};
        if (email) {
          query = {
            donorEmail: email,
          };
        }

        const result = await requestsCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (err) {
        console.error("Get Food Requests Error:", err.message);
        res.status(500).json({ message: "Failed to fetch requests" });
      }
    });

    //! check health
    app.get("/", (req, res) => {
      res.json({ message: "ShareBite Server is Running!" });
    });

    //! Ping MongoDB
    await client.db("admin").command({ ping: 1 });
    console.log("MongoDB Ping Successful!");
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

//! ---------------------------
run().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
});

// Graceful Shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await client.close();
  process.exit(0);
});
