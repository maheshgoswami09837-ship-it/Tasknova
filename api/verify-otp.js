import { MongoClient } from 'mongodb';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  if (!process.env.MONGODB_URI) {
    return res.status(500).json({ error: 'MONGODB_URI is not set in Vercel environment variables' });
  }

  let client;

  try {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();

    const record = await db.collection('otps').findOne({ email, otp });

    if (record) {
      await db.collection('otps').deleteOne({ email });
      res.status(200).json({ success: true, message: 'Verified' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('verify-otp error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
