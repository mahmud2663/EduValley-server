const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1ewqjef.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
})

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("EduValleyDB").collection("db");
    const paymentCollection = client
      .db("EduValleyDB")
      .collection("payments");
    const classes = client.db("EduValleyDB").collection("classes");
    const cart = client.db("EduValleyDB").collection("cart");
    const users = client.db("EduValleyDB").collection("users");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await users.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    
    app.get("/payments", async (req, res) => {
      try {
        const query = {};
        if (req.query.email) {
          query.email = req.query.email;
        }
        const results = await paymentCollection.find(query).toArray();

        res.send(results);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });


    app.get('/payments', async (req, res) => {
      const { email } = req.query;

      try {
          const paymentHistory = await paymentCollection.find({ email }).sort({ date: -1 }).toArray();
          res.send({ paymentHistory });
      } catch (error) {
          console.error('Error fetching payment history:', error);
          res.status(500).send({ error: 'An error occurred while fetching payment history' });
      }
  });


    app.get("/carts", async (req, res) => {
      const cursor = cart.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // ****
    app.get("/classes", async (req, res) => {
      const cursor = classes.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      let updateDoc;

      if (req.body.action === "approve") {
        updateDoc = {
          $set: {
            status: "approved",
          },
        };
      } else if (req.body.action === "deny") {
        updateDoc = {
          $set: {
            status: "denied",
          },
        };
      } else if (req.body.action === "feedback") {
        updateDoc = {
          $set: {
            feedback: req.body.feedback,
          },
        };
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      const result = await classes.findOneAndUpdate(filter, updateDoc);
      res.send(result);
    });

    //get role

    app.get("/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await users.findOne({ email: email });
      res.send(result);
    });

    //add carts in my selected card

    app.post("/addCarts", async (req, res) => {
      const myCart = req.body;
      const result = await cart.insertOne(myCart);
      console.log("MY class cart inserted:", myCart);
      res.send(result);
    });

    app.get("/addCarts", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await cart.find(query).toArray();
      res.send(result);
    });

    app.delete("/addCarts/:id", async (req, res) => {
      const id = req.params.id;
      const data = { _id: new ObjectId(id) };
      const result = await cart.deleteOne(data);
      console.log("Class deleted:", id);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await users.findOne(user);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await users.insertOne(user);
      res.send(result);
    });

    app.post("/addClass", async (req, res) => {
      const myClass = req.body;
      const result = await classes.insertOne(myClass);
      console.log("New class inserted:", myClass);
      res.send(result);
    });

    app.get("/manageClass", async (req, res) => {
      const cursor = classes.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/manageUsers", async (req, res) => {
      const cursor = users.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/users/:id/makeInstructor", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Instructor",
        },
      };
      const result = await users.updateOne(filter, updateDoc);
      res.send({ modifiedCount: result.modifiedCount });
    });

    app.patch("/users/:id/makeAdmin", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "Admin",
        },
      };
      const result = await users.updateOne(filter, updateDoc);
      res.send({ modifiedCount: result.modifiedCount });
    });

    app.get("/studentSelectedClass", async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = {
          email: req.query.email,
        };
      }
      const result = await cart.find(query).toArray();
      res.send(result);
    });

    app.get("/myClass", async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = {
          insEmail: req.query.email,
        };
      }
      const result = await classes.find(query).toArray();
      res.send(result);
    });

    app.get("/allClass", async (req, res) => {
      const cursor = classes.find();
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/popularClass", async (req, res) => {
      const cursor = classes.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/allInstructor", async (req, res) => {
      const cursor = users.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/myClassCart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cart.findOne(query);
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const classItemId = payment.cartItems;
      const query = { _id: new ObjectId(classItemId) };
      const deleteResult = await cart.deleteOne(query);
      res.send({ insertResult, deleteResult });
    });

    app.get("/popularInstructor", async (req, res) => {
      const cursor = users.find();
      const result = await cursor.toArray();
      res.send(result);
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

app.get("/", (req, res) => {
  res.send("Languages is coming");
});

app.listen(port, () => {
  console.log(`Languages is listening on port ${port}`);
});
