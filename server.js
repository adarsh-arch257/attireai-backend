import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import sharp from "sharp";
import axios from "axios";
import Replicate from "replicate";
import dotenv from "dotenv";

dotenv.config();

// ====== INIT ======
const app = express();
app.use(cors());
app.use(express.json());

// ====== CREATE UPLOADS FOLDER ======
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ====== SERVE STATIC FILES ======
app.use("/uploads", express.static(uploadDir));

// ====== REPLICATE INIT ======
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// ====== MONGODB CONNECTION ======
const MONGO_URI = "mongodb+srv://attireaibiz_db_user:attire123@cluster0.tzf5new.mongodb.net/attireai";

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error ❌", err));

// ====== MULTER STORAGE ======
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// ====== USER SCHEMA ======
const userSchema = new mongoose.Schema({
  bodyImage: String,
  upperImage: String,
  lowerImage: String,
  finalImage: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model("User", userSchema);

// ====== ROOT ======
app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

// ====== CREATE USER ======
app.post("/create-user", upload.single("bodyImage"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Body image required" });
    }

    const newUser = new User({
      bodyImage: req.file.path
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

// ====== ADD UPPER ======
app.post("/add-upper/:userId", upload.single("upperImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.upperImage = req.file.path;
    await user.save();

    res.json({ message: "Upper image added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== ADD LOWER ======
app.post("/add-lower/:userId", upload.single("lowerImage"), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.lowerImage = req.file.path;
    await user.save();

    res.json({ message: "Lower image added ✅" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====== FULL OUTFIT TRY-ON ======
app.post("/generate-outfit/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !user.bodyImage || !user.upperImage || !user.lowerImage) {
      return res.status(400).json({ error: "Body, upper and lower images required" });
    }

    // Resize images for better realism
    const resizedBody = `${uploadDir}/resized-body-${Date.now()}.jpg`;
    const resizedUpper = `${uploadDir}/resized-upper-${Date.now()}.jpg`;
    const resizedLower = `${uploadDir}/resized-lower-${Date.now()}.jpg`;

    await sharp(user.bodyImage).resize(768, 1024).toFile(resizedBody);
    await sharp(user.upperImage).resize(768, 1024).toFile(resizedUpper);
    await sharp(user.lowerImage).resize(768, 1024).toFile(resizedLower);

    // ⚠️ IMPORTANT:
    // Replace localhost with your deployed backend URL if deployed
    const baseURL = "http://localhost:5000";

    const output = await replicate.run(
      "lucataco/ootdiffusion:latest",
      {
        input: {
          model_image: `${baseURL}/${resizedBody}`,
          garment_image: `${baseURL}/${resizedUpper}`,
          lower_garment_image: `${baseURL}/${resizedLower}`,
          prompt: "realistic photo of the same person wearing the outfit, natural lighting, detailed fabric texture, photorealistic"
        }
      }
    );

    const resultURL = output[0];

    // Download final image
    const response = await axios.get(resultURL, {
      responseType: "arraybuffer"
    });

    const finalPath = `${uploadDir}/final-${Date.now()}.jpg`;
    await sharp(response.data).toFile(finalPath);

    user.finalImage = finalPath;
    await user.save();

    res.json({
      message: "Outfit generated ✅",
      result: `${baseURL}/${finalPath}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ====== GET FINAL RESULT ======
app.get("/result/:userId", async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user || !user.finalImage) {
    return res.status(404).json({ error: "No generated image found" });
  }

  res.json({
    result: `http://localhost:5000/${user.finalImage}`
  });
});

// ====== START SERVER ======
app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});