import mongoose from 'mongoose';

const { Schema } = mongoose;

export const DEFAULT_THRESHOLDS = {
  proximityM: 2,
  lowBatteryPct: 20,
  commTimeoutS: 15,
  tempLimitC: 68,
  overCapacityEnabled: true,
  restrictedAreaEnabled: true
};

const settingsSchema = new Schema({
  key: { type: String, unique: true, default: 'global' },
  thresholds: {
    proximityM: { type: Number, default: DEFAULT_THRESHOLDS.proximityM },
    lowBatteryPct: { type: Number, default: DEFAULT_THRESHOLDS.lowBatteryPct },
    commTimeoutS: { type: Number, default: DEFAULT_THRESHOLDS.commTimeoutS },
    tempLimitC: { type: Number, default: DEFAULT_THRESHOLDS.tempLimitC },
    overCapacityEnabled: { type: Boolean, default: true },
    restrictedAreaEnabled: { type: Boolean, default: true }
  },
  note: {
    type: String,
    default: 'College-prototype detection thresholds. Simulated limits only — not certified industrial safety values.'
  }
}, { timestamps: true });

export async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) settings = await Settings.create({ key: 'global' });
  return settings;
}

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
