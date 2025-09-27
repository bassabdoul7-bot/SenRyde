import mongoose from "mongoose";

const PointSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
}, { _id: false });

const TripSchema = new mongoose.Schema({
  rider:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  riderId:     { type: String, required: true },
  driver:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  driverId:    { type: String },
  origin:      { type: PointSchema, required: true },
  destination: { type: PointSchema, required: true },
  status:      { type: String, enum: ["pending","accepted","ongoing","completed","cancelled"], default: "pending" },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
}, { versionKey: false });

export const Trip = mongoose.models.Trip || mongoose.model("Trip", TripSchema);


