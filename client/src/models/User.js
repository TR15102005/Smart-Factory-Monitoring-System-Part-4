import mongoose from 'mongoose';

const { Schema } = mongoose;

const userSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'safety_officer', 'operator'], default: 'operator' },
  fullName: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
