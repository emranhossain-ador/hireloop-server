import express from "express";
import cors from "cors"; 
const app = express();

import { MongoClient } from 'mongodb';
import 'dotenv/config'


const PORT = process.env.PORT || 5001;

// Adds headers: Access-Control-Allow-Origin: *
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_AUTH_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connetClient = await connectToMongoDB();
const db = connetClient.db('hireloopdb');
const jobsCollection = db.collection("jobs_list");


app.get('/', (req, res) => {
  res.send('Hello World!')
})


app.post('/add-job', async(req, res)=>{
    const newData = {
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    const result = await jobsCollection.insertOne(newData);
    res.send(result);
})


app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})