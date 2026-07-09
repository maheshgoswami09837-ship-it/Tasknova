import { MongoClient } from 'mongodb';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Check env vars are present BEFORE doing anything else
  if (!process.env.MONGODB_URI) {
    return res.status(500).json({ error: 'MONGODB_URI is not set in Vercel environment variables' });
  }
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'EMAIL_USER or EMAIL_PASS is not set in Vercel environment variables' });
  }

  let client;

  try {
    // MongoClient creation moved INSIDE try so a bad connection string
    // returns a proper JSON error instead of crashing the whole function
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(); // Default database

    // 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to MongoDB
    await db.collection('otps').insertOne({ email, otp, createdAt: new Date() });

    // Send Email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"TaskNova" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your TaskNova Verification Code',
      text: `Aapka OTP code hai: ${otp}. Ye code 5 minute mein expire ho jayega.`,
      html: `
        <p>Namaste,</p>
        <p>Aapka TaskNova verification code hai:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
        <p>Ye code 5 minute mein expire ho jayega. Agar aapne ye request nahi kiya, is email ko ignore kar dein.</p>
        <p>Dhanyavaad,<br>TaskNova Team</p>
      `
    });

    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('send-otp error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (client) {
      await client.close();
    }
  }
}
