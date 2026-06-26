export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, otp } = req.body;

  if (!email || !name || !otp) {
    return res.status(400).json({ error: 'email, name, otp required' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
      },
      body: JSON.stringify({
        from: 'TaskNova <onboarding@resend.dev>',
        to: [email],
        subject: 'TaskNova - Your OTP Code: ' + otp,
        html: `
          <div style="font-family:Segoe UI,sans-serif;background:#05051a;padding:32px;border-radius:16px;max-width:480px;margin:auto;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#3b82f6);border-radius:16px;padding:12px 20px;">
                <span style="font-size:28px;">⚡</span>
                <span style="color:#fff;font-size:22px;font-weight:800;margin-left:8px;">TaskNova</span>
              </div>
            </div>
            <h2 style="color:#fff;text-align:center;margin-bottom:8px;">Email Verification</h2>
            <p style="color:rgba(255,255,255,0.6);text-align:center;margin-bottom:28px;">Hi ${name}, apna account verify karne ke liye neeche diya OTP use karein:</p>
            <div style="background:linear-gradient(135deg,rgba(108,99,255,0.2),rgba(59,130,246,0.2));border:2px solid rgba(108,99,255,0.4);border-radius:14px;padding:24px;text-align:center;margin-bottom:24px;">
              <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#fff;">${otp}</div>
              <p style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:8px;">Yeh OTP 10 minutes mein expire ho jayega</p>
            </div>
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-align:center;">Agar aapne signup nahi kiya toh is email ko ignore karein.</p>
          </div>
        `
      })
    });

    const data = await response.json();

    if (data.id) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(500).json({ error: data.message || 'Failed to send email' });
    }

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
