import express from "express";
import cors from "cors"; 
import { Stripe } from "stripe";
const app = express();

import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
const users = db.collection("user");
const sessions = db.collection("session");
const jobsCollection = db.collection("jobs_list");
const jobApplicationsCollection = db.collection("jobApplications");
const payments = db.collection("payments");


app.get('/', (req, res) => {
  res.send('Hello World!')
})



// Token verify
const tokenVerify = async(req, res, next)=>{

    const authHeader = req.headers.authorization;

    if(!authHeader){
        res.status(401).send({massage: "Unauthorized!!"});
        return;
    }

    const token = authHeader.split(' ')[1];
    
    if(!token){
        res.status(401).send({massage: "Unauthorized!!"});
        return; 
    }

    const query = { token };
    const session = await sessions.findOne(query);

    if(!session){
        res.status(401).send({massage: "Unauthorized!!"});
        return; 
    }

    const userId = session.userId;
    const user = await users.findOne({_id: new ObjectId(userId)});

    if(!user){
        res.status(401).send({massage: "Unauthorized!!"});
        return; 
    }

    req.user = user;

    next();
}

// Verify Seeker
const verifySeeker = async(req, res, next)=>{
    if(req.user.role !== 'seeker'){
        res.status(403).send({message: "Forbidden!!"});
        return;
    };
    next();
}

// Verify Recruiter
const verifyRecruiter = async(req, res, next)=>{
    if(req.user.role !== 'recruiter'){
        res.status(403).send({message: "Forbidden!!"});
        return;
    };
    next();
}

// Verify Admin
const verifyAdmin = async(req, res, next)=>{
    if(req.user.role !== 'admin'){
        res.status(403).send({message: "Forbidden!!"});
        return;
    };
    next();
}



app.get('/user/:userId/premium', async(req, res) => {
    const {userId} = req.params;
    const result = await users.findOne({_id: new ObjectId(userId)}, {projection: { premium : 1 }})
    res.send(result);
})


app.patch('/user/:Id/role', tokenVerify, verifyAdmin, async (req, res)=>{
    const {Id} = req.params;
    const query = {_id: new ObjectId(Id)};
    const updateDoc = {
        $set:{
            role: req.body.role
        }
    };

    const result = await users.updateOne(query, updateDoc);
    res.send(result);
});


app.get('/jobs', async (req, res) => {

    const query = {};

    if (req.query.jobType) {
        query.jobType = req.query.jobType;
    }

    if (req.query.jobCategory) {
        query.jobCategory = req.query.jobCategory;
    }

    if (req.query.search) {
        query.$or = [
            {
                jobTitle: {
                    $regex: req.query.search,
                    $options: 'i'
                }
            },
            {
                companyName: {
                    $regex: req.query.search,
                    $options: 'i'
                }
            }
        ];
    }

    const result = await jobsCollection.find(query).toArray();

    res.send(result);
});


app.get('/job/:Id', async(req, res)=>{
    const {Id} = req.params;
    const result = await jobsCollection.findOne({_id: new ObjectId(Id)});

    res.send(result);
})


app.post('/add-job', tokenVerify, verifyRecruiter, async(req, res)=>{
    const newData = {
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    const result = await jobsCollection.insertOne(newData);
    res.send(result);
})


app.delete('/jobs/:Id', async(req, res)=>{
    const {Id} = req.params;
    const result = await jobsCollection.deleteOne({_id: new ObjectId(Id)});
    res.send(result);
})


app.get('/jobs/:userId/user', async(req, res)=>{
    const {userId} = req.params;
    const result = await jobsCollection.find({userId:userId}).toArray();
    res.send(result);
})

// Job Applications area

app.post('/job-applications', tokenVerify, verifySeeker, async (req, res) => {
    try {
        
        const {jobId, userId} = req.body;

        //Check id valid or not
        if(!ObjectId.isValid(jobId) || !ObjectId.isValid(userId)){
            return res.status(400).send({success:false, message: "Invalid ID" }); 
        };

        // check job exits or not
        const job = await jobsCollection.findOne({_id: new ObjectId(jobId)});

        if (!job) {
            return res.status(404).send({success:false, message: "Job not found" });
        };

        // check already apply or not
        const exitsCheck = await jobApplicationsCollection.findOne({
            jobId: new ObjectId(jobId),
            userId: new ObjectId(userId)
        });


        if(exitsCheck){
            return res.status(409).send({
                success: false,
                message: "You have already applied for this job"
            });
        };

        const application = {
            jobId: new ObjectId(jobId),
            userId: new ObjectId(userId),
            status: "Pending",
            appliedAt: new Date()
        };

        const result = await jobApplicationsCollection.insertOne(application);
        res.status(201).send({
            success: true,
            message: "Applied successfully!",
            result
        });

    } catch (error) {
        res.status(500).send({success:false, message: "Internal server error" });
    }
})


app.get('/job-applications/count/:userId', async(req, res)=>{
    const {userId} = req.params;
    const result = await jobApplicationsCollection.countDocuments({userId: new ObjectId(userId)});
    res.send({count: result});
});

app.get('/job-applications/:userId', tokenVerify, async(req, res)=>{
    const {userId} = req.params;

    // Check valid user ID
    if (!ObjectId.isValid(userId)) {
        return res.status(400).send({
            success: false,
            message: "Invalid User ID"
        });
    }


    const result = await jobApplicationsCollection.aggregate([
        {
            $match:{
                userId: new ObjectId(userId)
            }
        },
        {
            $lookup:{
                from: "jobs_list",
                localField: "jobId",
                foreignField: "_id",
                as: "jobList"
            }
        },
        {
            $unwind: "$jobList"
        },
        {
            $sort: {
                appliedAt: -1
            }
        }
    ]).toArray();

    res.send({
        success: true,
        result
    });

});


app.get('/recruiter/job-applications/:jobId', async (req, res) => {

    const { jobId } = req.params;
    

    if (!ObjectId.isValid(jobId)) {
        return res.status(400).send({
            success: false,
            message: "Invalid Job ID"
        });
    }


    const result = await jobApplicationsCollection.aggregate([
        {
            $match: {
                jobId: new ObjectId(jobId)
            }
        },
        {
            $lookup: {
                from: "jobs_list",
                localField: "jobId",
                foreignField: "_id",
                as: "jobInfo"
            }
        },
        {
            $lookup: {
                from: "user",
                localField: "userId",
                foreignField: "_id",
                as: "userInfo"
            }
        },
        {
            $unwind: {
                path: "$jobInfo",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $unwind: {
                path: "$userInfo",
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $sort: {
                appliedAt: -1
            }
        }
    ]).toArray();

    res.send({
        success: true,
        result
    });
});

app.patch('/job-applications/:Id/status-change', async(req, res) =>{
    const {Id} = req.params;
    const query = {_id: new ObjectId(Id)};
    const updateDoc = {
        $set:{
            status: req.body.status
        }
    }
    const result = await jobApplicationsCollection.updateOne(query, updateDoc);
    res.send(result);
})


// Payments related api
app.post('/payments/checkout-verify', async(req, res)=>
{
     const { sessionId } = req.body;

    if (!sessionId) {
        return res.send({ success: false, message: 'Session ID is required' });
    }

    const {
        status,
        payment_status,
        customer_email,
        metadata,
        payment_intent,
    } = await stripe.checkout.sessions.retrieve(sessionId);

    // 1. is used new session 
    // 2. check is the session id for the currently logged in user
    // 3. insert sessionId into the payment Collection
    // 4. update user information as premium user

    if (status === 'complete' && payment_status === 'paid') {

        const sessionQuery = { sessionId };
        const existingPayment = await payments.findOne(sessionQuery);
        if (existingPayment) {
            return res.send({ success: false, message: 'Payment already verified' });
        }

        const payment = {
            sessionId,
            status,
            payment_status,
            customer_email,
            userId: metadata.userId,
            payment_date: new Date(),
            payment_intent,
        }

        const result = await payments.insertOne(payment);

        // update the user table
        const query = { _id: new ObjectId(metadata.userId) };

        const updatedDoc = {
            $set: {
                premium: true,
            }
        }
        const updateResult = await users.updateOne(
            query,
            updatedDoc
        );
        res.send({ success: true, result, updateResult });
        return
    }
    res.send({ success: false, message: 'Payment verification failed' })

});


app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
})