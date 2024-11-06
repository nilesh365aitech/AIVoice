import mongoose from "mongoose";

const slotSchema = new mongoose.Schema({
  time: String, // e.g., "10:00 AM"
  date: String, // e.g., "2024-10-29"
  isBooked: { type: Boolean, default: false },
});

const Slot = mongoose.model("Slot", slotSchema);
export default Slot;
