const logger = require("morgan");
const { sign } = require("jsonwebtoken");
const { MongoClient } = require("mongodb");
const bodyParser = require("body-parser");
const { createReadStream } = require("fs");
const { createClient } = require("redis");
const socket = require("socket.io");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = require("express")();

// Connect to server
const PORT = process.env.PORT || 8000;
const secret = process.env.SECRET || "secret";
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const server = app.listen(8000, () => {
  console.log(`Connected to port ${PORT}`);
});

// Setup socket connection

// Setup mongodb connection
const url = "mongodb://localhost:27017";
const client = new MongoClient(url);
client.connect(() => {
  console.log("Connected to mongodb");
});

// Setup Redis connection
const redisClient = createClient(REDIS_PORT);
redisClient.connect(() => {
  console.log(`Connected to redis on port: ${REDIS_PORT}`);
});
redisClient.on("error", (error) => {
  console.error(error);
});

//Setup rate limiter
const limiter = rateLimit({
  windowMs: 4 * 1000,
  max: 3,
});
// app.use(limiter);

app.use(logger("dev"));
app.use(bodyParser({ limit: "50mb" })); //Added to handle the massive post request in /aggregate
app.use(bodyParser.json()); // Parse JSON from the request body

// Enable CORS Middleware
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});
const options = {
  cors: {
    origin: "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Access-Control-Allow-Origin", "Content-Type"],
  },
};

// const io = socket(server, options);
// io.on("connection", (socket) => {
//   console.log(`Connected ${socket.id}`);
//   socket.on("talk", (data) => {
//     console.log("talk", data);
//     socket.emit("talk", data);
//   });
// });

// Setup CORS
app.get("/cors", (req, res) => {
  res.send("Hello World");
});

// Http requests
app.get("/requests", (req, res) => {
  res.json({ status: 200, message: "Success" });
});

app.post("/requests", (req, res) => {
  res.status(200).json({ status: 200, message: "Success" });
});

app.delete("/requests", (req, res) => {
  res.status(200).json({ status: 200, message: "Success" });
});

//Headers and Cookie part
app.get("/headers", (req, res) => {
  const { authorization } = req.headers;
  res.status(200).json({ token: authorization.split(" ")[1] });
});

app.get("/dynamic/:id", (req, res) => {
  res.json({ id: req.params.id });
});

app.get("/dynamic/", (req, res) => {
  res.json({ name: req.query.name });
});

//JWT part
app.post("/jwt", async (req, res) => {
  try {
    const { name, secretPassword } = req.body;
    console.log(req.body);
    // You would be saving the data here in some database
    const token = await sign({ name }, secret, {
      noTimestamp: false,
      expiresIn: "1h",
    });
    res.json({ jwt: token });
  } catch (error) {
    console.log(error);
    res.json({ status: 500, message: e.message });
  }
});

// Aggregations
app.post("/aggregate", async (req, res) => {
  try {
    //Save data in mongodb or SQL db
    const db = await client.db("webd");
    const collection = db.collection("documents");
    // const data = req.body;
    // const result = await collection.insertMany(data);
    // Comment above line of code if already saved data in db
    const pipeline = [
      {
        $group: {
          _id: "$department",
          average: {
            $avg: "$marks",
          },
        },
      },
      { $project: { average: { $round: ["$average", 0] } } },
      {
        $addFields: {
          department: {
            $function: {
              body: `function(id) {
                return id;
              }`,
              args: ["$_id"],
              lang: "js",
            },
          },
        },
      },
      { $unset: "_id" },
    ];
    //Perform the aggregation
    const result = await collection.aggregate(pipeline).toArray();
    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// Stream part
app.get("/stream", (req, res) => {
  const readStream = createReadStream("./stream.txt");
  readStream.pipe(res);
});

//Cache part
app.get("/cache", async (req, res) => {
  try {
    redisClient.get("data", async (err, data) => {
      if (err) {
        console.error(err);
        throw err;
      }

      if (data) {
        res.status(200).send(JSON.parse(data));
      } else {
        const db = await client.db("webd");
        const collection = db.collection("documents");
        const result = await collection.find({}).toArray();
        redisClient.setEx("data", 600, JSON.stringify(result));
        res.status(200).json(result);
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rate limiter
app.get("/rate", (req, res) => {
  res.send("Success");
});
