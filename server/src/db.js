import 'dotenv/config';
import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    await mongoose.connect(uri);
    console.log(`[db] connected to ${uri}`);
    return;
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  // mongodb-memory-server ignores MONGOMS_ARCH on the download path; pass binary opts explicitly.
  // No native Windows ARM64 MongoDB builds exist, so use the x64 binary (runs under Windows emulation).
  const binary = {};
  if (process.env.MONGOMS_VERSION) binary.version = process.env.MONGOMS_VERSION;
  if (process.env.MONGOMS_ARCH) binary.arch = process.env.MONGOMS_ARCH;
  const mem = await MongoMemoryServer.create({ binary });
  await mongoose.connect(mem.getUri('smart_factory'));
  console.log('[db] connected to in-memory MongoDB (set MONGODB_URI to persist data)');
}
