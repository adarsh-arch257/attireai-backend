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

// ===== CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===== REPLICATE =====
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
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
// 🔥 TRY-ON (WORKING MODEL)
// =====================================================
app.post("/tryon", async (req, res) => {
  try {
    const { person_image, cloth_image } = req.body;

    if (!person_image || !cloth_image) {
      return res.status(400).json({ error: "Images required" });
    }

    const output = await replicate.run(
      "stability-ai/sdxl",
      {
        input: {
          prompt: `A realistic fashion photo of a person wearing the outfit. Person reference: ${person_image}. Clothing reference: ${cloth_image}. Highly realistic, natural lighting, detailed fabric.`,
          width: 768,
          height: 1024
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

    if (!user.bodyImage || !user.upperImage) {
      return res.status(400).json({ error: "Images missing" });
    }

    const output = await replicate.run(
      "stability-ai/sdxl",
      {
        input: {
          prompt: `A realistic fashion photo of the same person wearing the outfit. Person: ${user.bodyImage}. Outfit: ${user.upperImage}.`,
          width: 768,
          height: 1024
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

  if (!user || !user.finalImage) {
    return res.status(404).json({ error: "No result found" });
  }

  res.json({
    result: user.finalImage
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});