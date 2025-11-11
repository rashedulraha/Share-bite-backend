const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

// ---------------------------
//!  Middleware
// ---------------------------
app.use(cors());
app.use(express.json());

// ---------------------------
//!  MongoDB Connection
// ---------------------------
// const uri =
//   "mongodb+srv://BidDokanDB:ajGXtiNnb0zsRJ2m@simpleproject.deo4wzy.mongodb.net/?appName=SimpleProject";
const uri = `mongodb+srv://${process.env.SHARE_BITE_USER}:${process.env.SHARE_BITE_kEY}@simpleproject.deo4wzy.mongodb.net/?appName=SimpleProject`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ---------------------------
//!  Run Main Function
// ---------------------------
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Database & Collections
    const db = client.db("Sharebite");
    const allProductsCollection = db.collection("all-food-data");

    // !popular food data
    app.get("/popular-food-data", async (req, res) => {
      const allProducts = await allProductsCollection.find().limit(6).toArray();
      res.send(allProducts);
    });

    //! get all food data
    app.get("/all-food-data", async (req, res) => {
      const allProducts = await allProductsCollection.find().toArray();
      res.send(allProducts);
    });

    // post single food data
    app.post("/all-food-data", async (req, res) => {
      const foodData = req.body;
      const result = await allProductsCollection.insertOne(foodData);
      res.status(201).send(result);
    });

    //! food details data
    app.get("/food-details/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await allProductsCollection.findOne(query);
      res.send(result);
    });

    //! find donation person data
    app.get("/donar-profile/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const projection = { donor: 1, _id: 0 };

      const result = await allProductsCollection.findOne(query, { projection });
      res.send(result);
    });

    //!  get my  listing food find by email

    app.get("/my-listings", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res
            .status(400)
            .send({ message: "Email query parameter missing" });
        }

        const result = await allProductsCollection
          .find({ "donor.email": email })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// ---------------------------
//  Server Listen
// ---------------------------
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
