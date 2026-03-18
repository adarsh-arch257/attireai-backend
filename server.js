import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import Replicate from "replicate";
import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// ===== INIT =====
const app = express();
app.use(cors());
app.use(express.json());

// ===== ENV =====
const PORT = process.env.PORT || 10000;
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

// ===== CLOUDINARY CONFIG =====
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

// ===== MULTER (TEMP STORAGE) =====
const upload = multer({ dest: "uploads/" });

// ===== SCHEMA =====
const userSchema = new mongoose.Schema({
  bodyImage: String,
  upperImage: String,
  lowerImage: String,
  finalImage: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// ===== ROOT =====
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});


// =====================================================
// 🚀 DIRECT TRY-ON TEST (FAST DEBUG)
// =====================================================
app.post("/tryon", async (req, res) => {
  try {
    const { person_image, cloth_image } = req.body;

    const output = await replicate.run(
      "lucataco/idm-vton",
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// USER FLOW (WITH CLOUDINARY)
// =====================================================

// CREATE USER (BODY IMAGE)
app.post("/create-user", upload.single("bodyImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Body image required" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path);

    // Delete local file
    fs.unlinkSync(req.file.path);

    const newUser = new User({
      bodyImage: result.secure_url
    });

    await newUser.save();

    res.json({
      message: "User created ✅",
      userId: newUser._id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ADD UPPER
app.post("/add-upper/:userId", upload.single("upperImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    user.upperImage = result.secure_url;
    await user.save();

    res.json({ message: "Upper added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ADD LOWER (optional for future)
app.post("/add-lower/:userId", upload.single("lowerImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const result = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    user.lowerImage = result.secure_url;
    await user.save();

    res.json({ message: "Lower added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// =====================================================
// 🔥 GENERATE OUTFIT (WORKING)
// =====================================================
app.post("/generate-outfit/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);

    if (!user || !user.bodyImage || !user.upperImage) {
      return res.status(400).json({ error: "Images missing" });
    }

    const output = await replicate.run(
      "lucataco/idm-vton",
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// GET RESULT
app.get("/result/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId);

  if (!user || !user.finalImage) {
    return res.status(404).json({ error: "No result" });
  }

  res.json({
    result: user.finalImage
  });
});


// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});