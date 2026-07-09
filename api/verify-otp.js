import { MongoClient } from 'mongodb';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { email, otp } = req.body;
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    const record = await db.collection('otps').findOne({ email, otp });
    
    if (record) {
      await db.collection('otps').deleteOne({ email });
      res.status(200).json({ success: true, message: "Verified" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await client.close();
  }
}
