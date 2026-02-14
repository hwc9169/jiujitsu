import { NextResponse } from "next/server";

type ExchangeRequest = {
  code?: string;
  redirectUri?: string;
};

type KakaoTokenResponse = {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export async function POST(req: Request) {
  try {
    const restApiKey = process.env.KAKAO_REST_API_KEY;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;

    if (!restApiKey) {
      return NextResponse.json(
        { error: "KAKAO_REST_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const body = (await req.json()) as ExchangeRequest;
    const code = body.code?.trim();
    const redirectUri = body.redirectUri?.trim();

    if (!code || !redirectUri) {
      return NextResponse.json(
        { error: "code and redirectUri are required" },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: restApiKey,
      redirect_uri: redirectUri,
      code,
    });
    if (clientSecret?.trim()) {
      params.set("client_secret", clientSecret.trim());
    }

    const kakaoResponse = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: params.toString(),
      cache: "no-store",
    });

    const kakaoJson = (await kakaoResponse.json().catch(() => ({}))) as KakaoTokenResponse;
    if (!kakaoResponse.ok) {
      const kakaoError = kakaoJson.error_description ?? kakaoJson.error ?? "Failed to exchange Kakao token";
      return NextResponse.json({ error: kakaoError }, { status: 400 });
    }

    if (!kakaoJson.id_token || !kakaoJson.access_token) {
      return NextResponse.json(
        {
          error:
            "id_token is missing. Enable OIDC in Kakao Developers and request openid scope.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      idToken: kakaoJson.id_token,
      accessToken: kakaoJson.access_token,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
