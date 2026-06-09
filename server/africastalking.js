import AfricasTalking from 'africastalking';
import crypto from 'crypto';

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

const sms = at.SMS;

/**
 * Send an SMS message to one or more recipients.
 * @param {string|string[]} to  - Phone number(s) in E.164 format (e.g. +254712345678)
 * @param {string} message      - Message body
 */
export async function sendSMS(to, message) {
  const recipients = Array.isArray(to) ? to : [to];
  // Africa's Talking expects +254... format
  const formatted = recipients.map((n) => (n.startsWith('+') ? n : `+${n}`));
  return sms.send({ to: formatted, message, from: process.env.AT_SENDER_ID || undefined });
}

/**
 * Generate a numeric OTP and return it (caller is responsible for persisting + sending).
 */
export function generateOtp(length = 6) {
  const digits = crypto.randomInt(0, Math.pow(10, length));
  return String(digits).padStart(length, '0');
}

/**
 * Send an OTP via SMS and return the plain-text OTP so the caller can hash + store it.
 */
export async function sendOtpSms(phone, otp) {
  const message = `Your Eric Art Glitch verification code is: ${otp}. Valid for 10 minutes. Do not share it.`;
  await sendSMS(phone, message);
  return otp;
}
