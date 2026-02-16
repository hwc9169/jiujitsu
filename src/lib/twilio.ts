type TwilioSendInput = {
  to: string;
  body: string;
};

type TwilioSendResult = {
  sid: string;
  status: string | null;
  to: string;
};

type TwilioErrorPayload = {
  message?: string;
  code?: number;
};

function normalizePhoneToE164(rawPhone: string) {
  const trimmed = rawPhone.trim();
  if (trimmed.length === 0) {
    throw new Error("Phone number is required.");
  }

  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d+]/g, "");
    if (!/^\+\d{8,15}$/.test(digits)) {
      throw new Error("Phone number must be valid E.164 format.");
    }
    return digits;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error("Phone number is too short.");
  }

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  if (digits.startsWith("82")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+82${digits.slice(1)}`;
  }

  return `+${digits}`;
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim() ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "";

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }

  if (!fromNumber && !messagingServiceSid) {
    throw new Error("Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  }

  return { accountSid, authToken, fromNumber, messagingServiceSid };
}

export async function sendTwilioSms({ to, body }: TwilioSendInput): Promise<TwilioSendResult> {
  const config = getTwilioConfig();
  const normalizedTo = normalizePhoneToE164(to);

  const payload = new URLSearchParams();
  payload.set("To", normalizedTo);
  payload.set("Body", body);
  if (config.messagingServiceSid) {
    payload.set("MessagingServiceSid", config.messagingServiceSid);
  } else {
    payload.set("From", config.fromNumber);
  }

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    cache: "no-store",
  });

  const json = (await response.json().catch(() => ({}))) as TwilioErrorPayload & {
    sid?: string;
    status?: string;
  };

  if (!response.ok) {
    const message = json.message || `Twilio request failed (${response.status})`;
    throw new Error(message);
  }

  return {
    sid: json.sid ?? "",
    status: json.status ?? null,
    to: normalizedTo,
  };
}
