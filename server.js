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
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error ❌", err));

// ===== MULTER =====
const upload = multer({ dest: "uploads/" });

// ===== SCHEMA =====
const User = mongoose.model("User", new mongoose.Schema({
  bodyImage: String,
  upperImage: String,
  finalImage: String
}));

// ===== ROOT =====
app.get("/", (req, res) => {
  res.send("TRYON VERSION LIVE ✅");
});


// =====================================================
// 🔥 TRY-ON (FINAL WORKING MODEL)
// =====================================================
app.post("/tryon", async (req, res) => {
  try {
    const { person_image, cloth_image } = req.body;

    if (!person_image || !cloth_image) {
      return res.status(400).json({ error: "Images required" });
    }

    let output;

    const runModel = async () => {
      return await replicate.run(
        "black-forest-labs/flux-schnell",
        {
          input: {
            prompt: `A realistic fashion photo of a person wearing the outfit. Person: ${person_image}. Outfit: ${cloth_image}. Highly realistic, natural lighting.`
          }
        }
      );
    };

    try {
      output = await runModel();
    } catch (err) {
      if (err.message.includes("429")) {
        console.log("Retrying after rate limit...");
        await new Promise(r => setTimeout(r, 7000));
        output = await runModel();
      } else {
        throw err;
      }
    }

    res.json({
      success: true,
      result: output
    });

  } catch (err) {
    console.error("TRYON ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// ===== CREATE USER =====
app.post("/create-user", upload.single("bodyImage"), async (req, res) => {
  try {
    const uploadRes = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    const user = await User.create({
      bodyImage: uploadRes.secure_url
    });

    res.json({ userId: user._id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ADD UPPER =====
app.post("/add-upper/:id", upload.single("upperImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    const uploadRes = await cloudinary.uploader.upload(req.file.path);
    fs.unlinkSync(req.file.path);

    user.upperImage = uploadRes.secure_url;
    await user.save();

    res.json({ message: "Upper added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GENERATE OUTFIT =====
app.post("/generate-outfit/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    let output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: `A realistic fashion photo of the same person wearing the outfit. Person: ${user.bodyImage}. Outfit: ${user.upperImage}.`
        }
      }
    );

    user.finalImage = output[0];
    await user.save();

    res.json({ result: output[0] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GET RESULT =====
app.get("/result/:id", async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json({ result: user.finalImage });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});