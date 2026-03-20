import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import Replicate from "replicate";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// ===== INIT =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== ENV =====
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;

// ===== CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===== REPLICATE =====
const replicate = new Replicate({
  auth: REPLICATE_TOKEN,
});

// ===== MONGODB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error ❌", err));

// ===== MULTER =====
const upload = multer({ dest: "uploads/" });

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  bodyImage: String,
  upperImage: String,
  finalImage: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ===== ROOT =====
app.get("/", (req, res) => {
  res.send("TRYON VERSION LIVE ✅");
});


// =====================================================
// 🔥 TRY-ON DIRECT TEST
// =====================================================
app.post("/tryon", async (req, res) => {
  try {
    const { person_image, cloth_image } = req.body;

    if (!person_image || !cloth_image) {
      return res.status(400).json({ error: "Images required" });
    }

    const output = await replicate.run(
      "lucataco/idm-vton:latest",   // ✅ FIXED MODEL
      {
        input: {
          human_img: person_image,
          garm_img: cloth_image
        }
      }
    );

    res.json({
      success: true,
      result: output
    });

  } catch (err) {
    console.error("TRYON ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// USER FLOW
// =====================================================

// CREATE USER
app.post("/create-user", upload.single("bodyImage"), async (req, res) => {
  try {
    const uploadRes = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    const user = new User({
      bodyImage: uploadRes.secure_url
    });

    await user.save();

    res.json({
      message: "User created ✅",
      userId: user._id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD UPPER
app.post("/add-upper/:userId", upload.single("upperImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    const uploadRes = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    user.upperImage = uploadRes.secure_url;
    await user.save();

    res.json({ message: "Upper added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GENERATE OUTFIT
app.post("/generate-outfit/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    const output = await replicate.run(
      "lucataco/idm-vton:latest",
      {
        input: {
          human_img: user.bodyImage,
          garm_img: user.upperImage
        }
      }
    );

    const resultURL = output[0];

    user.finalImage = resultURL;
    await user.save();

    res.json({
      message: "Outfit generated ✅",
      result: resultURL
    });

  } catch (err) {
    console.error("GENERATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET RESULT
app.get("/result/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId);

  res.json({
    result: user.finalImage
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});