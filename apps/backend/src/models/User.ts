import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, index: true },
  role:      { type: String, enum: ["driver","rider","admin"], required: true },
  password:  { type: String, required: true },
  createdAt: { type: Date,   default: Date.now },
  updatedAt: { type: Date,   default: Date.now },
}, { versionKey: false });

export const User = mongoose.models.User || mongoose.model("User", UserSchema);


