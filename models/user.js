const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  bodyImage: {
    type: String,
    required: true,
  },
  occasion: {
    type: String,
  },
  time: {
    type: String,
  },
  upperImages: [
    {
      type: String,
    }
  ],
  lowerImages: [
    {
      type: String,
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("User", userSchema);