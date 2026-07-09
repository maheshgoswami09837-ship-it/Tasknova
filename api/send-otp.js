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
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #f5f7fa; padding: 32px 24px; border-radius: 12px;">
        <h2 style="color: #2563eb; margin-bottom: 4px;">TaskNova</h2>
        <p style="color: #555; font-size: 14px; margin-top: 0;">Your verification code</p>

        <div style="background: #fff; border-radius: 10px; padding: 24px; text-align: center; margin: 20px 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
          <p style="margin: 0 0 8px; color: #333; font-size: 14px;">Yeh raha aapka OTP code:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb;">${otp}</div>
        </div>

        <p style="color: #777; font-size: 13px; text-align: center; margin: 0;">
          Ye code <b>5 minute</b> mein expire ho jayega. Agar aapne request nahi kiya, toh is email ko ignore karein.
        </p>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
        <p style="color: #aaa; font-size: 12px; text-align: center; margin: 0;">
          &copy; ${new Date().getFullYear()} TaskNova. Sab rights reserved.
        </p>
      </div>
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
